import { AuthUser, ClientEntity, Notification, PbcItem, PbcItemFile, PbcList, Requirement, Submission } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(path: string, method: HttpMethod, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      'ngrok-skip-browser-warning': 'true', // bypass ngrok browser-warning page on free tier
    },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: 'Request failed.' }));
    throw new Error(payload.message ?? 'Request failed.');
  }

  return response.json() as Promise<T>;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', 'POST', undefined, { email, password });
}

export function fetchClients(token: string): Promise<ClientEntity[]> {
  return request<ClientEntity[]>('/api/clients', 'GET', token);
}

export function fetchRequirements(token: string): Promise<Requirement[]> {
  return request<Requirement[]>('/api/requirements', 'GET', token);
}

export function fetchNotifications(token: string): Promise<Notification[]> {
  return request<Notification[]>('/api/notifications', 'GET', token);
}

export function createRequirement(token: string, payload: Omit<Requirement, 'id' | 'status'>): Promise<Requirement> {
  return request<Requirement>('/api/requirements', 'POST', token, payload);
}

export function fetchPbcLists(token: string): Promise<PbcList[]> {
  return request<PbcList[]>('/api/pbc-lists', 'GET', token);
}

export function deletePbcList(token: string, pbcListId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/pbc-lists/${encodeURIComponent(pbcListId)}`, 'DELETE', token);
}

export function downloadPbcTemplate(token: string, clientId?: string): Promise<Blob> {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  return fetch(`${API_URL}/api/pbc-lists/template${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
    },
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: 'Request failed.' }));
      throw new Error(payload.message ?? 'Request failed.');
    }

    return response.blob();
  });
}

export function uploadPbcList(token: string, clientId: string, file: File): Promise<PbcList> {
  const formData = new FormData();
  formData.append('file', file);

  return request<PbcList>(`/api/pbc-lists/${clientId}`, 'POST', token, formData);
}

export function fetchPbcItems(token: string, pbcListId?: string): Promise<PbcItem[]> {
  const query = pbcListId ? `?pbcListId=${encodeURIComponent(pbcListId)}` : '';
  return request<PbcItem[]>(`/api/pbc-items${query}`, 'GET', token);
}

export function savePbcItems(
  token: string,
  items: Array<{
    id: string;
    requestId: string;
    description: string;
    priority: string;
    riskAssertion: string;
    owner: string;
    requestedDate: string;
    dueDate: string;
    status: string;
    remarks: string;
  }>,
): Promise<{ updatedCount: number }> {
  return request<{ updatedCount: number }>('/api/pbc-items/bulk', 'PUT', token, { items });
}

export function downloadUpdatedPbcItemsExcel(
  token: string,
  payload: { pbcListId: string; itemIds: string[] },
): Promise<Blob> {
  return fetch(`${API_URL}/api/pbc-items/export`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: 'Request failed.' }));
      throw new Error(payload.message ?? 'Request failed.');
    }

    return response.blob();
  });
}

export function updatePbcItemStatus(token: string, pbcItemId: string, status: string): Promise<PbcItem> {
  return request<PbcItem>(`/api/pbc-items/${encodeURIComponent(pbcItemId)}/status`, 'PUT', token, { status });
}

export function uploadRequirementFile(token: string, requirementId: string, file: File): Promise<Submission> {
  const formData = new FormData();
  formData.append('file', file);

  return request<Submission>(`/api/uploads/${requirementId}`, 'POST', token, formData);
}

export function fetchPbcItemFiles(token: string, pbcItemId: string): Promise<PbcItemFile[]> {
  return request<PbcItemFile[]>(`/api/pbc-item-files?pbcItemId=${encodeURIComponent(pbcItemId)}`, 'GET', token);
}

export function uploadPbcItemFile(token: string, pbcItemId: string, file: File): Promise<PbcItemFile> {
  const formData = new FormData();
  formData.append('file', file);

  return request<PbcItemFile>(`/api/pbc-item-files/${encodeURIComponent(pbcItemId)}`, 'POST', token, formData);
}

export function deletePbcItemFile(token: string, fileId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/pbc-item-files/${encodeURIComponent(fileId)}`, 'DELETE', token);
}
