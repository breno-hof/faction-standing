/**
 * A tiny in-memory stand-in for the parts of Foundry VTT and dnd5e 6.1 the
 * module touches: actors (including `faction` actors), embedded renown items,
 * scenes and tokens, settings, sockets and the v14 `_del` update operator.
 * It is enough to exercise data writes, the membership index, disposition
 * recalculation, migrations and socket validation without a running Foundry.
 */

type Fn = (...args: any[]) => unknown;

function getProperty(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setProperty(obj: any, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  let target = obj;
  for (const k of keys) {
    target[k] ??= {};
    target = target[k];
  }
  target[last] = value;
}

function deleteProperty(obj: any, path: string): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  const parent = keys.length ? getProperty(obj, keys.join(".")) : obj;
  if (parent) delete parent[last];
}

/** Stand-in for Foundry v14's `_del` operator. */
export const DEL = Symbol("_del");

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

/** Foundry-style update of one path: objects merge, `_del` deletes, arrays replace. */
function applyUpdate(obj: any, path: string, value: unknown): void {
  if (value === DEL) return deleteProperty(obj, path);
  if (isPlainObject(value)) {
    const current = getProperty(obj, path);
    if (!isPlainObject(current)) setProperty(obj, path, {});
    for (const [k, v] of Object.entries(value)) applyUpdate(obj, `${path}.${k}`, v);
    return;
  }
  setProperty(obj, path, value);
}

let docCounter = 0;
const nextId = () => `doc${++docCounter}`;

class Collection<T extends { id: string }> extends Array<T> {
  get(id: string | undefined): T | undefined {
    return this.find((x) => x.id === id);
  }
}

const hooks = new Map<string, Fn[]>();

export class FakeItem {
  documentName = "Item";
  id: string;
  type: string;
  name: string;
  img = "icons/svg/item-bag.svg";
  system: any;
  flags: Record<string, any>;
  parent: FakeActor;

  constructor(parent: FakeActor, data: any) {
    this.parent = parent;
    this.id = data._id ?? nextId();
    this.type = data.type;
    this.name = data.name;
    if (data.img) this.img = data.img;
    this.system = structuredClone(data.system ?? {});
    this.flags = structuredClone(data.flags ?? {});
  }

  async update(data: Record<string, unknown>): Promise<this> {
    for (const [k, v] of Object.entries(data)) if (k !== "_id") applyUpdate(this, k, v);
    emit("updateItem", this, data);
    return this;
  }
}

export class FakeActor {
  documentName = "Actor";
  items = new Collection<FakeItem>();
  flags: Record<string, any> = {};
  prototypeToken: any = { disposition: 0, flags: {} };
  system: any = {};
  isToken = false;
  id: string;
  type: string;
  name: string;
  img = "icons/svg/mystery-man.svg";
  owners: string[];

  constructor(opts: { id: string; type: string; name?: string; owners?: string[] }) {
    this.id = opts.id;
    this.type = opts.type;
    this.name = opts.name ?? opts.id;
    this.owners = opts.owners ?? [];
  }

  get uuid(): string {
    return `Actor.${this.id}`;
  }
  get identifier(): string {
    return this.system.identifier ?? "";
  }
  get itemTypes(): Record<string, FakeItem[]> {
    const out: Record<string, FakeItem[]> = {};
    for (const item of this.items) (out[item.type] ??= []).push(item);
    return out;
  }
  async createEmbeddedDocuments(_type: string, data: any[]): Promise<FakeItem[]> {
    const created = data.map((d) => new FakeItem(this, d));
    for (const item of created) {
      this.items.push(item);
      emit("createItem", item);
    }
    return created;
  }
  async deleteEmbeddedDocuments(_type: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      const index = this.items.findIndex((i) => i.id === id);
      if (index < 0) continue;
      const [item] = this.items.splice(index, 1);
      emit("deleteItem", item);
    }
  }
  async delete(): Promise<this> {
    const actors = (globalThis as any).game.actors as FakeActor[];
    const index = actors.indexOf(this);
    if (index >= 0) actors.splice(index, 1);
    emit("deleteActor", this);
    return this;
  }
  get hasPlayerOwner(): boolean {
    return this.owners.length > 0;
  }
  get isOwner(): boolean {
    const g = (globalThis as any).game;
    return g.user.isGM || this.owners.includes(g.user.id);
  }
  testUserPermission(user: any, level: string): boolean {
    return level === "OWNER" && (user.isGM || this.owners.includes(user.id));
  }
  getFlag(scope: string, key: string): any {
    return getProperty(this.flags[scope], key);
  }
  async setFlag(scope: string, key: string, value: unknown): Promise<this> {
    this.flags[scope] ??= {};
    setProperty(this.flags[scope], key, structuredClone(value));
    emit("updateActor", this, { flags: { [scope]: {} } });
    return this;
  }
  async unsetFlag(scope: string, key: string): Promise<this> {
    deleteProperty(this.flags[scope] ?? {}, key);
    emit("updateActor", this, { flags: { [scope]: {} } });
    return this;
  }
  async update(data: Record<string, unknown>): Promise<this> {
    for (const [k, v] of Object.entries(data)) if (k !== "_id") applyUpdate(this, k, v);
    emit("updateActor", this, data);
    return this;
  }
}

export class FakeToken {
  disposition: number;
  flags: Record<string, any> = {};
  constructor(
    public id: string,
    public actor: FakeActor,
    disposition = 0,
  ) {
    this.disposition = disposition;
  }
  get actorId(): string {
    return this.actor.id;
  }
}

export class FakeScene {
  tokens = new Collection<FakeToken>();
  constructor(public id: string) {}
  async updateEmbeddedDocuments(_type: string, updates: Record<string, any>[]): Promise<void> {
    for (const u of updates) {
      const token = this.tokens.get(u._id)!;
      for (const [k, v] of Object.entries(u)) if (k !== "_id") setProperty(token, k, v);
    }
  }
}

export function emit(hook: string, ...args: unknown[]): void {
  for (const fn of hooks.get(hook) ?? []) fn(...args);
}

export interface MockWorld {
  actors: Collection<FakeActor>;
  scenes: Collection<FakeScene>;
  settings: Map<string, unknown>;
  emitted: unknown[];
  notifications: string[];
  setUser(id: string, isGM: boolean): void;
}

export const DISPOSITIONS = { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 } as const;

/** Installs fresh Foundry globals. Call before each test. */
export function installFoundryMock(): MockWorld {
  hooks.clear();
  const actors = new Collection<FakeActor>();
  const scenes = new Collection<FakeScene>();
  const settings = new Map<string, unknown>();
  const settingDefs = new Map<string, any>();
  const emitted: unknown[] = [];
  const notifications: string[] = [];
  let id = 0;

  const users = new Collection<any>();
  users.push({ id: "gm", name: "GM", isGM: true }, { id: "p1", name: "Player", isGM: false });

  const game: any = {
    ready: false,
    actors,
    scenes,
    users,
    user: users.get("gm"),
    modules: new Map([["tidy5e-sheet", { active: true }]]),
    i18n: {
      lang: "en",
      localize: (k: string) => k,
      format: (k: string, d: Record<string, unknown>) => `${k}:${JSON.stringify(d)}`,
    },
    settings: {
      register(scope: string, key: string, def: any) {
        settingDefs.set(`${scope}.${key}`, def);
        settings.set(`${scope}.${key}`, structuredClone(def.default));
      },
      get(scope: string, key: string) {
        const k = `${scope}.${key}`;
        if (!settingDefs.has(k)) throw new Error(`setting ${k} not registered`);
        return structuredClone(settings.get(k));
      },
      async set(scope: string, key: string, value: unknown) {
        const k = `${scope}.${key}`;
        settings.set(k, structuredClone(value));
        settingDefs.get(k)?.onChange?.(value);
        return value;
      },
      registerMenu() {},
    },
    socket: {
      handlers: new Map<string, Fn>(),
      on(name: string, fn: Fn) {
        this.handlers.set(name, fn);
      },
      emit(_name: string, data: unknown) {
        emitted.push(data);
      },
    },
  };
  Object.defineProperty(users, "activeGM", {
    get: () => {
      const gm = users.find((u) => u.isGM);
      return gm ? { ...gm, isSelf: game.user.id === gm.id } : null;
    },
    configurable: true,
  });

  const g = globalThis as any;
  g.game = game;
  g.CONST = { TOKEN_DISPOSITIONS: DISPOSITIONS };
  g.ui = {
    notifications: {
      info: (m: string) => notifications.push(m),
      warn: (m: string) => notifications.push(m),
      error: (m: string) => notifications.push(m),
    },
  };
  g.Hooks = {
    on(name: string, fn: Fn) {
      hooks.set(name, [...(hooks.get(name) ?? []), fn]);
      return 0;
    },
    once(name: string, fn: Fn) {
      return g.Hooks.on(name, fn);
    },
    off() {},
    callAll(name: string, ...args: unknown[]) {
      emit(name, ...args);
      return true;
    },
  };
  g._del = DEL;
  g.CONFIG = {
    Actor: {
      dataModels: { faction: {}, character: {}, npc: {}, group: {} },
      documentClass: { DEFAULT_ICON: "icons/svg/mystery-man.svg" },
    },
    DND5E: { factionCategories: {} },
  };
  g.Actor = {
    implementation: {
      async updateDocuments(updates: Record<string, any>[]) {
        for (const u of updates) await actors.get(u._id)!.update(u);
      },
      async create(data: any) {
        const actor = new FakeActor({ id: data._id ?? nextId(), type: data.type, name: data.name });
        if (data.img) actor.img = data.img;
        actor.system = structuredClone(data.system ?? {});
        actor.flags = structuredClone(data.flags ?? {});
        actors.push(actor);
        emit("createActor", actor);
        return actor;
      },
    },
  };
  g.fromUuidSync = (uuid: string) => actors.get(uuid.replace(/^Actor\./, ""));
  g.foundry = {
    applications: { instances: new Map() },
    utils: {
      deepClone: (o: unknown) => structuredClone(o),
      randomID: () => `id${++id}`,
      hasProperty: (o: any, p: string) => getProperty(o, p) !== undefined,
      expandObject: (o: Record<string, unknown>) => {
        const out = {};
        for (const [k, v] of Object.entries(o)) setProperty(out, k, v);
        return out;
      },
    },
  };

  return {
    actors,
    scenes,
    settings,
    emitted,
    notifications,
    setUser(userId: string, isGM: boolean) {
      game.user = { ...users.get(userId), isGM };
    },
  };
}
