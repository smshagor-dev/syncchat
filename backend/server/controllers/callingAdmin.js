const dns = require('dns').promises;
const net = require('net');
const response = require('../helpers/response');
const {
  getCallConfigForAdmin,
  mergeCallConfigInput,
  saveCallConfig,
  markCallConfigTest,
} = require('../helpers/callConfig');
const { logAdminAction } = require('../helpers/adminAudit');

const safeError = (error0) =>
  String(error0?.message || 'Calling configuration operation failed').replace(
    /(credential|secret|password)=([^&\s]+)/gi,
    '$1=***'
  );

const parseIceHost = (iceUrl) => {
  const raw = String(iceUrl || '').trim();
  const schemeMatch = raw.match(/^(stun|stuns|turn|turns):/i);
  if (!schemeMatch) throw new Error(`Invalid ICE URL: ${raw}`);
  const scheme = schemeMatch[1].toLowerCase();
  const remainder = raw.slice(schemeMatch[0].length).replace(/^\/\//, '');
  const authority = remainder.split(/[/?#]/)[0];
  if (!authority) throw new Error(`ICE URL host is missing: ${raw}`);

  let host = authority;
  let port = scheme === 'turns' || scheme === 'stuns' ? 5349 : 3478;
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    if (end < 0) throw new Error(`Invalid IPv6 ICE URL: ${raw}`);
    host = authority.slice(1, end);
    const rest = authority.slice(end + 1);
    if (rest.startsWith(':')) port = Number(rest.slice(1)) || port;
  } else {
    const lastColon = authority.lastIndexOf(':');
    if (lastColon > -1 && authority.indexOf(':') === lastColon) {
      host = authority.slice(0, lastColon);
      port = Number(authority.slice(lastColon + 1)) || port;
    }
  }

  const transportMatch = raw.match(/[?&]transport=(udp|tcp)/i);
  return {
    raw,
    scheme,
    host,
    port,
    transport: transportMatch ? transportMatch[1].toLowerCase() : null,
  };
};

const checkTcp = ({ host, port }, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (error0) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error0) reject(error0);
      else resolve();
    };
    socket.setTimeout(timeoutMs, () => finish(new Error('TCP timeout')));
    socket.once('connect', () => finish());
    socket.once('error', finish);
  });

const validateIceReachability = async (config) => {
  const urls = [
    ...(config.stunUrls || []),
    ...(config.turn?.enabled ? config.turn.urls || [] : []),
  ];
  const checks = [];

  for (const value of urls) {
    const parsed = parseIceHost(value);
    if (!net.isIP(parsed.host)) await dns.lookup(parsed.host);

    let tcpReachable = null;
    if (
      parsed.scheme === 'turns' ||
      parsed.scheme === 'stuns' ||
      parsed.transport === 'tcp'
    ) {
      try {
        await checkTcp(parsed);
        tcpReachable = true;
      } catch (error0) {
        throw new Error(`Unable to reach ${parsed.host}:${parsed.port} over TCP`);
      }
    }

    checks.push({
      type: 'ice',
      url: parsed.raw,
      host: parsed.host,
      port: parsed.port,
      dnsResolved: true,
      tcpReachable,
    });
  }

  return checks;
};

const validateSfuReachability = async (config) => {
  if (!config.groupSfu?.enabled) return [];
  const url = new URL(config.groupSfu.url.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:'));
  const host = url.hostname;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!net.isIP(host)) await dns.lookup(host);
  try {
    await checkTcp({ host, port }, 4000);
  } catch (error0) {
    throw new Error(`Unable to reach LiveKit at ${host}:${port}`);
  }
  return [
    {
      type: 'sfu',
      provider: 'livekit',
      url: config.groupSfu.url,
      host,
      port,
      dnsResolved: true,
      tcpReachable: true,
    },
  ];
};

exports.getCallConfig = async (req, res) => {
  try {
    response({ res, payload: await getCallConfigForAdmin() });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: safeError(error0),
    });
  }
};

exports.updateCallConfig = async (req, res) => {
  try {
    const payload = await saveCallConfig(req.body || {});
    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'calling.config.update',
      entityType: 'calling',
      entityId: 'global',
    }).catch(() => {});
    response({
      res,
      message: 'Calling configuration saved',
      payload,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 400,
      success: false,
      message: safeError(error0),
    });
  }
};

exports.testCallConfig = async (req, res) => {
  try {
    const startedAt = Date.now();
    const merged = await mergeCallConfigInput(req.body || {});
    const [iceChecks, sfuChecks] = await Promise.all([
      validateIceReachability(merged),
      validateSfuReachability(merged),
    ]);
    const checks = [...iceChecks, ...sfuChecks];
    const latencyMs = Date.now() - startedAt;
    const message = merged.groupSfu?.enabled
      ? 'ICE and LiveKit endpoint validation passed. Media allocation and room join are verified during a real call.'
      : 'ICE configuration is valid and server host resolution passed. TURN media allocation is verified during a real call.';
    await markCallConfigTest({ success: true, message });
    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'calling.config.test',
      entityType: 'calling',
      entityId: 'global',
      metadata: { success: true, latencyMs, checks: checks.length },
    }).catch(() => {});
    response({
      res,
      message,
      payload: { success: true, latencyMs, checks },
    });
  } catch (error0) {
    const message = safeError(error0);
    await markCallConfigTest({ success: false, message }).catch(() => {});
    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'calling.config.test',
      entityType: 'calling',
      entityId: 'global',
      metadata: { success: false },
    }).catch(() => {});
    response({
      res,
      statusCode: 400,
      success: false,
      message,
    });
  }
};
