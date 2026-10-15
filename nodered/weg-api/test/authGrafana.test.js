'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CONFIG_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'authgraf-')), 'config.json');
process.env.AUTH_USER = 'admin';
process.env.AUTH_PASSWORD = 'admin-pass';

const test = require('node:test');
const assert = require('node:assert/strict');
const { login, logout, authGrafana } = require('../src/middleware/auth');

function fakeRes() {
  const r = { status: 200, headers: {}, cookies: [], body: null };
  r.res = {
    status(s) { r.status = s; return this; },
    set(k, v) { r.headers[k] = v; return this; },
    append(k, v) { r.cookies.push(v); return this; },
    json(b) { r.body = b; return this; },
    end() { return this; },
  };
  return r;
}
const call = (fn, req) => { const r = fakeRes(); fn({ headers: {}, socket: {}, path: '/api/auth/grafana', ...req }, r.res); return r; };
const doLogin = (extra = {}, headers = {}) =>
  call(login, { headers, body: { user: 'admin', password: 'admin-pass', ...extra } });

test('no token → 401', () => {
  assert.equal(call(authGrafana, {}).status, 401);
});

test('valid header token → 204 and prefixed X-Auth-User', () => {
  const { token } = doLogin().body;
  const r = call(authGrafana, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(r.status, 204);
  assert.equal(r.headers['X-Auth-User'], 'portal_admin');
});

test('valid cookie → 204', () => {
  const { token } = doLogin().body;
  assert.equal(call(authGrafana, { headers: { cookie: `a=b; frio_token=${token}` } }).status, 204);
});

test('only the exact path answers (no trailing slash, no case variants)', () => {
  const { token } = doLogin().body;
  const headers = { authorization: `Bearer ${token}` };
  assert.notEqual(call(authGrafana, { headers, path: '/api/auth/grafana/' }).status, 204);
  assert.notEqual(call(authGrafana, { headers, path: '/API/AUTH/GRAFANA' }).status, 204);
});

test('invalid token (header or cookie) → 401', () => {
  assert.equal(call(authGrafana, { headers: { authorization: 'Bearer nope' } }).status, 401);
  assert.equal(call(authGrafana, { headers: { cookie: 'frio_token=nope' } }).status, 401);
});

test('login sets HttpOnly Strict cookie; Secure only over https; noCookie skips it', () => {
  const plain = doLogin();
  assert.match(plain.cookies[0], /^frio_token=[0-9a-f]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=/);
  assert.doesNotMatch(plain.cookies[0], /Secure/);
  assert.match(doLogin({}, { 'x-forwarded-proto': 'https' }).cookies[0], /; Secure;/);
  assert.equal(doLogin({ noCookie: true }).cookies.length, 0);
});

test('logout revokes the token and clears the cookie', () => {
  const { token } = doLogin().body;
  const r = call(logout, { headers: { authorization: `Bearer ${token}`, cookie: `frio_token=${token}` } });
  assert.match(r.cookies[0], /^frio_token=; .*Max-Age=0/);
  assert.equal(call(authGrafana, { headers: { cookie: `frio_token=${token}` } }).status, 401);
});
