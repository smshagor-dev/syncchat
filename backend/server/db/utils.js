exports.toPlain = (doc) => {
  if (!doc) return null;
  return typeof doc.get === 'function' ? doc.get({ plain: true }) : doc;
};

exports.toPlainMany = (docs = []) => docs.map((doc) => exports.toPlain(doc));

exports.asArray = (value) => (Array.isArray(value) ? value : []);

exports.addToSet = (source, values) => {
  const next = new Set(exports.asArray(source));
  exports.asArray(values).forEach((value) => next.add(value));
  return [...next];
};

exports.pullFromArray = (source, values) => {
  const remove = new Set(exports.asArray(values));
  return exports.asArray(source).filter((value) => !remove.has(value));
};
