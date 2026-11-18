import { normalizeEmail } from './config.js';

export class ApiError extends Error {
  constructor(code = 'msg_invalid_form', status = 422) { super(code); this.code = code; this.status = status; }
}
export const LANGUAGES = ['en', 'hi', 'te'];
export const CATEGORIES = ['financial', 'account', 'harassment', 'malware', 'other'];
export const STATUSES = ['pending', 'in_review', 'awaiting_info', 'resolved', 'closed'];
export const TRANSITIONS = {
  pending: ['in_review', 'awaiting_info', 'closed'], in_review: ['awaiting_info', 'resolved', 'closed'],
  awaiting_info: ['in_review', 'resolved', 'closed'], resolved: ['in_review', 'closed'], closed: ['in_review'],
};
const controls = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u;
import english from '../data/ui_en.json' with { type: 'json' };
import hindi from '../data/ui_hi.json' with { type: 'json' };
import telugu from '../data/ui_te.json' with { type: 'json' };
import agencyEntries from '../data/agencies.json' with { type: 'json' };
export const dictionaries = { en: english, hi: hindi, te: telugu };
export const agencies = agencyEntries;
export function text(value, min, max, code = 'msg_invalid_form') {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || controls.test(value)) throw new ApiError(code);
  return value.trim();
}
export function email(value) { try { return normalizeEmail(value); } catch { throw new ApiError('msg_email_invalid'); } }
export function password(value, confirmation = value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || value.includes('\0') || value !== confirmation) throw new ApiError('msg_password_policy');
  return value;
}
export function locale(value = 'en') { if (!LANGUAGES.includes(value)) throw new ApiError(); return value; }
export function fields(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key)) || required.some(key => !Object.hasOwn(value, key))) throw new ApiError();
  return value;
}
export function identifier(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiError('msg_not_found', 404);
  return value.toLowerCase();
}
export function version(value) { if (!Number.isInteger(value) || value < 1 || value > 999999999) throw new ApiError(); return value; }
export function pageNumber(value = '1') { if (!/^[1-9][0-9]{0,3}$|^10000$/.test(value)) throw new ApiError('msg_invalid_form', 400); return Number(value); }
function translated(value, max, empty = false) {
  fields(value, LANGUAGES);
  return Object.fromEntries(LANGUAGES.map(language => [language, text(value[language], empty ? 0 : 1, max)]));
}
function safeUrl(value, logo = false) {
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x20\x7f]/.test(value)) return false;
  if (logo) return /^\/static\/img\/[A-Za-z0-9_-]+\.(?:svg|png|webp)$/.test(value);
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
export function contentValue(section, value) {
  if (/^copy_(en|hi|te)$/.test(section)) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 1000 || Object.keys(value).some(key => !Object.hasOwn(dictionaries[section.slice(5)], key))) throw new ApiError();
    return Object.fromEntries(Object.entries(value).map(([key, string]) => [key, text(string, 1, 3000)]));
  }
  if (section === 'advisory') {
    fields(value, ['active', 'priority', 'text']);
    if (typeof value.active !== 'boolean' || !['normal', 'high'].includes(value.priority)) throw new ApiError();
    return { active: value.active, priority: value.priority, text: translated(value.text, 500, !value.active) };
  }
  if (section === 'branding') {
    fields(value, ['title', 'logo_url', 'tagline']);
    if (!safeUrl(value.logo_url, true)) throw new ApiError();
    return { title: text(value.title, 2, 100), logo_url: value.logo_url, tagline: translated(value.tagline, 150) };
  }
  if (section === 'resources') {
    if (!Array.isArray(value) || value.length > 100) throw new ApiError();
    const identifiers = new Set();
    return value.map(item => {
      fields(item, ['id', 'acronym', 'name', 'region', 'group', 'url', 'purpose', 'reporting']);
      if (typeof item.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(item.id) || identifiers.has(item.id) || !['international', 'india', 'national'].includes(item.group) || !safeUrl(item.url)) throw new ApiError();
      identifiers.add(item.id);
      return { id: item.id, acronym: text(item.acronym, 1, 40), group: item.group, url: item.url,
        ...Object.fromEntries(['name', 'region', 'purpose', 'reporting'].map(key => [key, translated(item[key], 2000)])) };
    });
  }
  throw new ApiError('msg_not_found', 404);
}
