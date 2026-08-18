const mongoose = require('mongoose');
const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { db, isDev } = require('../config');

const registry = new Map();
const proxies = new WeakMap();
mongoose.set('strictQuery', true);
if (isDev && process.env.MONGODB_DEBUG === 'true') mongoose.set('debug', true);

const objectLike = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp) && !Buffer.isBuffer(v);
const clone = (v) => {
  if (v == null) return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(clone);
  if (objectLike(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
};
const opName = (k) => typeof k === 'symbol' ? (k.description || Symbol.keyFor(k) || String(k).slice(7, -1)) : String(k);
const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const like = (v) => new RegExp(`^${String(v || '').split('').map((c) => c === '%' ? '.*' : c === '_' ? '.' : esc(c)).join('')}$`, 'i');

const fieldOps = (value) => {
  if (!objectLike(value)) return value;
  const keys = Reflect.ownKeys(value);
  if (!keys.some((k) => typeof k === 'symbol')) return clone(value);
  const out = {};
  for (const key of keys) {
    const raw = value[key];
    switch (opName(key)) {
      case 'eq': case 'is': out.$eq = raw; break;
      case 'ne': out.$ne = raw; break;
      case 'not': typeof raw === 'object' && raw !== null ? out.$not = fieldOps(raw) : out.$ne = raw; break;
      case 'gt': out.$gt = raw; break;
      case 'gte': out.$gte = raw; break;
      case 'lt': out.$lt = raw; break;
      case 'lte': out.$lte = raw; break;
      case 'in': out.$in = Array.isArray(raw) ? raw : [raw]; break;
      case 'notIn': out.$nin = Array.isArray(raw) ? raw : [raw]; break;
      case 'between': if (Array.isArray(raw)) { out.$gte = raw[0]; out.$lte = raw[1]; } break;
      case 'notBetween': if (Array.isArray(raw)) out.$not = { $gte: raw[0], $lte: raw[1] }; break;
      case 'like': case 'iLike': out.$regex = like(raw); break;
      case 'notLike': case 'notILike': out.$not = like(raw); break;
      case 'startsWith': out.$regex = new RegExp(`^${esc(raw)}`, 'i'); break;
      case 'endsWith': out.$regex = new RegExp(`${esc(raw)}$`, 'i'); break;
      case 'substring': out.$regex = new RegExp(esc(raw), 'i'); break;
      case 'regexp': case 'iRegexp': out.$regex = raw instanceof RegExp ? raw : new RegExp(String(raw), 'i'); break;
      case 'contains': out.$all = Array.isArray(raw) ? raw : [raw]; break;
      case 'overlap': out.$in = Array.isArray(raw) ? raw : [raw]; break;
      default: throw new Error(`Unsupported database operator: ${opName(key)}`);
    }
  }
  return out;
};

const methodWhere = (where) => {
  const fn = String(where?.attribute?.fn || '').toUpperCase();
  const field = where?.attribute?.args?.[0]?.col;
  const comparator = String(where?.comparator || '=').trim();
  if (fn !== 'LOWER' || !field || comparator !== '=') return null;
  return { [field]: new RegExp(`^${esc(String(where.logic ?? ''))}$`, 'i') };
};
const translateWhere = (where = {}) => {
  if (!objectLike(where)) return where || {};
  const method = methodWhere(where);
  if (method) return method;
  const out = {};
  for (const key of Reflect.ownKeys(where)) {
    const raw = where[key];
    if (typeof key === 'symbol') {
      const name = opName(key);
      if (['or', 'and', 'nor'].includes(name)) {
        out[`$${name}`] = (Array.isArray(raw) ? raw : [raw]).map(translateWhere);
      } else if (name === 'not') out.$nor = [translateWhere(raw)];
      else throw new Error(`Unsupported logical database operator: ${name}`);
    } else if (objectLike(raw)) {
      out[key] = Reflect.ownKeys(raw).some((k) => typeof k === 'symbol') ? fieldOps(raw) : clone(raw);
    } else out[key] = clone(raw);
  }
  return out;
};

const sortSpec = (order) => Array.isArray(order) ? order.filter(Array.isArray).map(([f, d = 'ASC']) => [f, String(d).toUpperCase() === 'DESC' ? -1 : 1]) : [];
const queryOptions = (query, options = {}) => {
  const a = options.attributes;
  if (Array.isArray(a) && a.length && a.every((x) => typeof x === 'string')) query.select(a.join(' '));
  else if (objectLike(a)) {
    if (Array.isArray(a.include)) query.select(a.include.join(' '));
    if (Array.isArray(a.exclude)) query.select(a.exclude.map((x) => `-${x}`).join(' '));
  }
  const order = sortSpec(options.order); if (order.length) query.sort(order);
  if (Number(options.offset) > 0) query.skip(Number(options.offset));
  if (Number.isFinite(Number(options.limit)) && Number(options.limit) >= 0) query.limit(Number(options.limit));
  if (options.raw) query.lean();
  return query;
};

const fnName = (x) => String(x?.fn || '').toUpperCase();
const colName = (x) => x?.col || x?.args?.[0]?.col || null;
const aggregateAttrs = (a) => Array.isArray(a) && a.some((x) => Array.isArray(x) && x[0]?.fn);
const dateExpr = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: 'UTC' } });
const groupExpr = (g) => typeof g === 'string' ? { key: g, value: `$${g}` } : fnName(g) === 'DATE' && colName(g) ? { key: `date:${colName(g)}`, value: dateExpr(colName(g)) } : null;
const aggregatePipeline = (options = {}) => {
  const attrs = Array.isArray(options.attributes) ? options.attributes : [];
  const groups = (Array.isArray(options.group) ? options.group : options.group ? [options.group] : []).map(groupExpr).filter(Boolean);
  const group = { _id: null };
  if (groups.length === 1) group._id = groups[0].value;
  else if (groups.length > 1) group._id = Object.fromEntries(groups.map((x, i) => [`g${i}`, x.value]));
  const project = { _id: 0 };
  const grouped = (key) => { const i = groups.findIndex((x) => x.key === key); return i < 0 ? null : groups.length === 1 ? '$_id' : `$_id.g${i}`; };
  for (const attr of attrs) {
    if (typeof attr === 'string') { const v = grouped(attr); if (v) project[attr] = v; continue; }
    if (!Array.isArray(attr) || attr.length < 2) continue;
    const [expr, alias] = attr; const fn = fnName(expr); const field = colName(expr);
    if (fn === 'DATE') { project[alias] = grouped(`date:${field}`) || dateExpr(field); continue; }
    if (fn === 'COUNT') group[alias] = { $sum: 1 };
    else if (fn === 'SUM') group[alias] = { $sum: `$${field}` };
    else if (fn === 'AVG') group[alias] = { $avg: `$${field}` };
    else if (fn === 'MAX') group[alias] = { $max: `$${field}` };
    else if (fn === 'MIN') group[alias] = { $min: `$${field}` };
    else throw new Error(`Unsupported aggregate database function: ${fn}`);
    project[alias] = `$${alias}`;
  }
  const pipeline = [{ $match: translateWhere(options.where || {}) }, { $group: group }, { $project: project }];
  const order = sortSpec(options.order); if (order.length) pipeline.push({ $sort: Object.fromEntries(order) });
  if (Number(options.offset) > 0) pipeline.push({ $skip: Number(options.offset) });
  if (Number.isFinite(Number(options.limit)) && Number(options.limit) >= 0) pipeline.push({ $limit: Number(options.limit) });
  return pipeline;
};

const wrap = (doc) => {
  if (!doc || !doc.$__) return doc;
  if (proxies.has(doc)) return proxies.get(doc);
  let proxy;
  proxy = new Proxy(doc, { get(target, prop, receiver) {
    if (prop === 'get') return (arg, ...rest) => objectLike(arg) && arg.plain === true ? target.toObject({ depopulate: true, versionKey: false, virtuals: false }) : target.get(arg, ...rest);
    if (prop === 'update') return async (values = {}) => { target.set(values); await target.save(); return proxy; };
    if (prop === 'destroy') return async () => { await target.deleteOne(); return proxy; };
    if (prop === 'save') return async (...args) => wrap(await target.save(...args));
    const value = Reflect.get(target, prop, receiver); return typeof value === 'function' ? value.bind(target) : value;
  }});
  proxies.set(doc, proxy); return proxy;
};
const wrapMany = (v) => Array.isArray(v) ? v.map(wrap) : wrap(v);

const defaultValue = (d) => {
  if (!Object.prototype.hasOwnProperty.call(d, 'defaultValue')) return undefined;
  const v = d.defaultValue; const key = String(v?.key || v?.constructor?.key || '').toUpperCase();
  if (v === DataTypes.UUIDV4 || key === 'UUIDV4') return uuidv4;
  if (v === DataTypes.NOW || key === 'NOW') return Date.now;
  if (typeof v === 'function') return v;
  return Array.isArray(v) || objectLike(v) ? () => clone(v) : v;
};
const mongoType = (type) => {
  const text = `${type?.key || type?.constructor?.key || type?.constructor?.name || ''} ${String(type || '')}`.toUpperCase();
  if (/BOOLEAN|TINYINT\(1\)/.test(text)) return Boolean;
  if (/DATE|TIME/.test(text)) return Date;
  if (/INTEGER|BIGINT|SMALLINT|MEDIUMINT|TINYINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/.test(text)) return Number;
  if (/JSON|JSONB|ARRAY|HSTORE|RANGE|GEOMETRY|GEOGRAPHY/.test(text)) return mongoose.Schema.Types.Mixed;
  if (/BLOB|BINARY/.test(text)) return Buffer;
  return String;
};
const fieldSchema = (raw) => {
  const d = objectLike(raw) ? raw : { type: raw };
  const out = { type: mongoType(d.type) };
  if (d.allowNull === false) out.required = true;
  if (d.unique) out.unique = true;
  if (d.index) out.index = true;
  const def = defaultValue(d); if (def !== undefined) out.default = def;
  const values = d.values || d.type?.values || d.type?.options?.values; if (Array.isArray(values) && values.length) out.enum = values;
  if (Array.isArray(d.validate?.len)) { out.minLength = Number(d.validate.len[0]); out.maxLength = Number(d.validate.len[1]); }
  if (Number.isFinite(Number(d.validate?.min))) out.min = Number(d.validate.min);
  if (Number.isFinite(Number(d.validate?.max))) out.max = Number(d.validate.max);
  return out;
};
const schemaFor = (fields, options, name) => {
  const schema = new mongoose.Schema(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fieldSchema(v)])), {
    collection: options.tableName || name, timestamps: options.timestamps !== false, versionKey: false, id: false, minimize: false, strict: true,
  });
  for (const idx of options.indexes || []) {
    const spec = {}; for (const f of idx.fields || []) spec[typeof f === 'string' ? f : f.attribute || f.name] = 1;
    if (Object.keys(spec).length) schema.index(spec, { unique: !!idx.unique, sparse: !!idx.sparse, name: idx.name });
  }
  return schema;
};

const facadeFor = (name, model) => ({
  name, modelName: name, mongoModel: model,
  async findOne(options = {}) { if (aggregateAttrs(options.attributes)) return (await model.aggregate(aggregatePipeline({ ...options, limit: 1 })))[0] || null; const r = await queryOptions(model.findOne(translateWhere(options.where || {})), options).exec(); return options.raw ? r : wrap(r); },
  async findAll(options = {}) { if (aggregateAttrs(options.attributes) || options.group) return model.aggregate(aggregatePipeline(options)); const r = await queryOptions(model.find(translateWhere(options.where || {})), options).exec(); return options.raw ? r : wrapMany(r); },
  async findByPk(id, options = {}) { const r = await queryOptions(model.findById(id), options).exec(); return options.raw ? r : wrap(r); },
  async create(values = {}) { return wrap(await model.create(values)); },
  async bulkCreate(records = [], options = {}) { if (!records.length) return []; if (!options.ignoreDuplicates) return wrapMany(await model.insertMany(records)); const out = []; for (const r of records) try { out.push(wrap(await model.create(r))); } catch (e) { if (e?.code !== 11000) throw e; } return out; },
  async findOrCreate(options = {}) { const where = translateWhere(options.where || {}); let doc = await model.findOne(where); if (doc) return [wrap(doc), false]; try { doc = await model.create({ ...(options.defaults || {}), ...(options.where || {}) }); return [wrap(doc), true]; } catch (e) { if (e?.code !== 11000) throw e; doc = await model.findOne(where); if (!doc) throw e; return [wrap(doc), false]; } },
  async update(values = {}, options = {}) { const r = await model.updateMany(translateWhere(options.where || {}), { $set: values }, { runValidators: true }); return [r.modifiedCount || 0]; },
  async destroy(options = {}) { const r = await model.deleteMany(translateWhere(options.where || {})); return r.deletedCount || 0; },
  async count(options = {}) { return model.countDocuments(translateWhere(options.where || {})); },
  async max(field, options = {}) { return (await model.findOne(translateWhere(options.where || {})).sort([[field, -1]]).select(field).lean())?.[field] ?? null; },
  async min(field, options = {}) { return (await model.findOne(translateWhere(options.where || {})).sort([[field, 1]]).select(field).lean())?.[field] ?? null; },
  async sum(field, options = {}) { return (await model.aggregate([{ $match: translateWhere(options.where || {}) }, { $group: { _id: null, value: { $sum: `$${field}` } } }]))[0]?.value || 0; },
});

const database = {
  define(name, fields, options = {}) { if (registry.has(name)) return registry.get(name).facade; const schema = schemaFor(fields, options, name); const model = mongoose.models[name] || mongoose.model(name, schema, name); const facade = facadeFor(name, model); registry.set(name, { model, facade }); return facade; },
  async authenticate() { if (mongoose.connection.readyState === 1) return mongoose.connection; await mongoose.connect(db.uri, { dbName: db.name, autoIndex: db.autoIndex, serverSelectionTimeoutMS: db.serverSelectionTimeoutMs }); return mongoose.connection; },
  async sync() { if (db.autoIndex) await Promise.all([...registry.values()].map(({ model }) => model.createIndexes())); },
  async close() { if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); },
  get models() { return Object.fromEntries([...registry].map(([name, x]) => [name, x.facade])); },
  translateWhere,
};
module.exports = database;
