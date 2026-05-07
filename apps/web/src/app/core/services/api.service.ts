import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '@env/environment';
import {
  AuthUser,
  ClientEntity,
  LoginResponse,
  Notification,
  PbcItem,
  PbcItemFile,
  PbcList,
  Requirement,
  Submission,
} from '../models/types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = (environment.apiUrl ?? 'https://code-games-1.onrender.com').replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  resolveUrl(path: string): string {
    const sanitizedPath = (path ?? '').trim().replace(/^\/(https?:\/\/)/i, '$1');
    if (/^https?:\/\//i.test(sanitizedPath)) return sanitizedPath;
    const normalizedPath = sanitizedPath.startsWith('/') ? sanitizedPath : `/${sanitizedPath}`;
    return `${this.baseUrl}${normalizedPath}`;
  }

  private headers(token?: string): HttpHeaders {
    let h = new HttpHeaders({ 'ngrok-skip-browser-warning': 'true' });
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(this.resolveUrl('/api/auth/login'), { email, password }, {
      headers: new HttpHeaders({ 'ngrok-skip-browser-warning': 'true' }),
    });
  }

  fetchClients(token: string): Observable<ClientEntity[]> {
    return this.http.get<ClientEntity[]>(this.resolveUrl('/api/clients'), { headers: this.headers(token) });
  }

  fetchRequirements(token: string): Observable<Requirement[]> {
    return this.http.get<Requirement[]>(this.resolveUrl('/api/requirements'), { headers: this.headers(token) });
  }

  fetchNotifications(token: string): Observable<Notification[]> {
    return this.http.get<Notification[]>(this.resolveUrl('/api/notifications'), { headers: this.headers(token) });
  }

  fetchPbcLists(token: string): Observable<PbcList[]> {
    return this.http.get<PbcList[]>(this.resolveUrl('/api/pbc-lists'), { headers: this.headers(token) });
  }

  deletePbcList(token: string, pbcListId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      this.resolveUrl(`/api/pbc-lists/${encodeURIComponent(pbcListId)}`),
      { headers: this.headers(token) },
    );
  }

  approvePbcList(token: string, pbcListId: string): Observable<PbcList> {
    return this.http.put<PbcList>(
      this.resolveUrl(`/api/pbc-lists/${encodeURIComponent(pbcListId)}/approve`),
      {},
      { headers: this.headers(token) },
    );
  }

  downloadPbcTemplate(token: string, clientId?: string): Observable<Blob> {
    const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
    return this.http.get(this.resolveUrl(`/api/pbc-lists/template${query}`), {
      headers: this.headers(token),
      responseType: 'blob',
    });
  }

  uploadPbcList(token: string, clientId: string, file: File): Observable<PbcList> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<PbcList>(this.resolveUrl(`/api/pbc-lists/${clientId}`), formData, {
      headers: this.headers(token),
    });
  }

  generateAutoPbcList(token: string, clientId: string, submissionId?: string): Observable<PbcList> {
    return this.http.post<PbcList>(
      this.resolveUrl(`/api/pbc-lists/auto-generate/${encodeURIComponent(clientId)}`),
      submissionId ? { submissionId } : {},
      { headers: this.headers(token) },
    );
  }

  fetchPbcItems(token: string, pbcListId?: string): Observable<PbcItem[]> {
    const query = pbcListId ? `?pbcListId=${encodeURIComponent(pbcListId)}` : '';
    return this.http.get<PbcItem[]>(this.resolveUrl(`/api/pbc-items${query}`), { headers: this.headers(token) });
  }

  savePbcItems(
    token: string,
    items: Array<{
      id: string; requestId: string; description: string; priority: string;
      riskAssertion: string; owner: string; requestedDate: string;
      dueDate: string; status: string; remarks: string;
    }>,
  ): Observable<{ updatedCount: number }> {
    return this.http.put<{ updatedCount: number }>(
      this.resolveUrl('/api/pbc-items/bulk'),
      { items },
      { headers: this.headers(token) },
    );
  }

  downloadUpdatedPbcItemsExcel(token: string, payload: { pbcListId: string; itemIds: string[] }): Observable<Blob> {
    return this.http.post(this.resolveUrl('/api/pbc-items/export'), payload, {
      headers: this.headers(token),
      responseType: 'blob',
    });
  }

  updatePbcItemStatus(token: string, pbcItemId: string, status: string): Observable<PbcItem> {
    return this.http.put<PbcItem>(
      this.resolveUrl(`/api/pbc-items/${encodeURIComponent(pbcItemId)}/status`),
      { status },
      { headers: this.headers(token) },
    );
  }

  uploadRequirementFile(
    token: string,
    requirementId: string,
    file: File,
    options?: { replaceExistingTrialBalance?: boolean },
  ): Observable<Submission> {
    const formData = new FormData();
    formData.append('file', file);
    const query = options?.replaceExistingTrialBalance ? '?replaceExistingTrialBalance=true' : '';
    return this.http.post<Submission>(
      this.resolveUrl(`/api/uploads/${requirementId}${query}`),
      formData,
      { headers: this.headers(token) },
    );
  }

  fetchSubmissions(token: string): Observable<Submission[]> {
    return this.http.get<Submission[]>(this.resolveUrl('/api/uploads'), { headers: this.headers(token) });
  }

  deleteSubmission(token: string, submissionId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      this.resolveUrl(`/api/uploads/${encodeURIComponent(submissionId)}`),
      { headers: this.headers(token) },
    );
  }

  fetchPbcItemFiles(token: string, pbcItemId: string): Observable<PbcItemFile[]> {
    return this.http.get<PbcItemFile[]>(
      this.resolveUrl(`/api/pbc-item-files?pbcItemId=${encodeURIComponent(pbcItemId)}`),
      { headers: this.headers(token) },
    );
  }

  uploadPbcItemFile(token: string, pbcItemId: string, file: File): Observable<PbcItemFile> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<PbcItemFile>(
      this.resolveUrl(`/api/pbc-item-files/${encodeURIComponent(pbcItemId)}`),
      formData,
      { headers: this.headers(token) },
    );
  }

  reviewPbcItemFile(token: string, fileId: string, decision: 'accepted' | 'rejected'): Observable<PbcItemFile> {
    return this.http.put<PbcItemFile>(
      this.resolveUrl(`/api/pbc-item-files/${encodeURIComponent(fileId)}/review`),
      { decision },
      { headers: this.headers(token) },
    );
  }

  deletePbcItemFile(token: string, fileId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      this.resolveUrl(`/api/pbc-item-files/${encodeURIComponent(fileId)}`),
      { headers: this.headers(token) },
    );
  }

  getNotificationStreamUrl(token: string): string {
    return this.resolveUrl(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
  }
}
