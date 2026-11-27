import Constants from 'expo-constants';
import { File } from 'expo-file-system';

import { prepareForUpload } from './imageResize';

// On a phone running Expo Go, "localhost" is the phone itself. Reuse the dev machine's address
// that Expo already knows (hostUri, e.g. "192.168.1.20:8081") and swap in the API port.
function defaultBaseUrl() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:8000`;
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultBaseUrl();

export class ApiError extends Error {
  status;

  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
}

// For <Image> sources that need the login header, e.g. pet photos.
export function authHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(method, path, body) {
  // FormData (file uploads) sets its own multipart Content-Type; everything else is JSON.
  const isForm = body instanceof FormData;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...authHeaders(),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (e) {
    // Include the underlying error: fetch also throws here for problems on the phone (e.g. a file
    // it can't read), not only when the server is down.
    console.warn(`${method} ${path} failed before reaching the server:`, e);
    throw new ApiError(0, `Can't reach the server at ${API_URL}. Is the backend running? (${e?.message ?? e})`);
  }

  if (res.status === 401 && authToken) onUnauthorized?.();
  if (res.status === 204) return undefined;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data) ?? `Request failed (${res.status})`);
  return data;
}

// FastAPI returns either {"detail": "message"} or {"detail": [{"msg": ...}, ...]} for validation errors.
function errorMessage(data) {
  const detail = data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '');
  return null;
}

// asset is an expo-image-picker asset ({ uri, ... }). Expo SDK 58's fetch can't send the old
// React Native `{ uri, name, type }` form parts, so attach an expo-file-system File instead.
// Every photo is resized on the phone first (see imageResize.js), so any size of photo works.
async function photoFile(asset) {
  return new File((await prepareForUpload(asset)).uri);
}

async function photoForm(asset) {
  const form = new FormData();
  form.append('photo', await photoFile(asset));
  return form;
}

// Shapes returned by the backend (see backend/app/schemas.py for the full definitions):
//   User   { id, first_name, last_name, email, avatar_url: string | null }
//   Pet    { id, name, species: 'dog' | 'cat', age_years, photo_url: string | null, created_at,
//            latest_report: Report | null }
//   Report { id, pet_id, input_method, breed_breakdown: [{ breed, percent }], biological_age, timeline, created_at }
//   timeline item { condition, description, symptoms[], prevention[], severity: 'low' | 'medium' | 'high',
//                   onset_min_years, onset_max_years, life_stage: 'young' | 'adult' | 'senior', from_breeds[] }
//   Breed  { id, species, name, traits }
export const api = {
  register: (body) => request('POST', '/auth/register', body),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  forgotPassword: (email) => request('POST', '/auth/forgot-password', { email }),
  resetPassword: (email, code, new_password) =>
    request('POST', '/auth/reset-password', { email, code, new_password }),
  me: () => request('GET', '/auth/me'),
  updateMe: (body) => request('PATCH', '/auth/me', body),
  changePassword: (current_password, new_password) =>
    request('POST', '/auth/me/password', { current_password, new_password }),
  deleteAccount: () => request('DELETE', '/auth/me'),

  listPets: () => request('GET', '/pets'),
  getPet: (id) => request('GET', `/pets/${id}`),
  createPet: (body) => request('POST', '/pets', body),
  // body: { name?, age_years? } — only the fields sent change; age_years: null clears the age.
  updatePet: (id, body) => request('PATCH', `/pets/${id}`, body),
  deletePet: (id) => request('DELETE', `/pets/${id}`),
  uploadPetPhoto: async (id, asset) => request('PUT', `/pets/${id}/photo`, await photoForm(asset)),
  removePetPhoto: (id) => request('DELETE', `/pets/${id}/photo`),
  uploadAvatar: async (asset) => request('PUT', '/auth/me/avatar', await photoForm(asset)),
  removeAvatar: () => request('DELETE', '/auth/me/avatar'),
  listReports: (petId) => request('GET', `/pets/${petId}/reports`),
  getReport: (petId, reportId) => request('GET', `/pets/${petId}/reports/${reportId}`),

  // Care log entries: { id, pet_id, kind, title, date: 'YYYY-MM-DD', status: 'completed' | 'upcoming', notes }
  listCare: (petId) => request('GET', `/pets/${petId}/care`),
  addCare: (petId, body) => request('POST', `/pets/${petId}/care`, body),
  updateCare: (petId, eventId, body) => request('PUT', `/pets/${petId}/care/${eventId}`, body),
  deleteCare: (petId, eventId) => request('DELETE', `/pets/${petId}/care/${eventId}`),
  deleteReport: (petId, reportId) => request('DELETE', `/pets/${petId}/reports/${reportId}`),

  listBreeds: (species) => request('GET', `/breeds?species=${species}`),
  // Pass a listed breed's id, or any breed name typed by the user (looked up with AI on the server).
  analyzeManual: (petId, { breedId = null, breedName = null }) =>
    request(
      'POST',
      `/pets/${petId}/analysis/manual`,
      breedId !== null ? { breed_id: breedId } : { breed_name: breedName },
    ),
  // assets: 1-3 expo-image-picker assets. Claude estimates the breed mix from them on the server.
  analyzePhoto: async (petId, assets, knownBreed) => {
    const form = new FormData();
    for (const asset of assets) form.append('photos', await photoFile(asset));
    if (knownBreed) form.append('known_breed', knownBreed);
    return request('POST', `/pets/${petId}/analysis/photo`, form);
  },
};
