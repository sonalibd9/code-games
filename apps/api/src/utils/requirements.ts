import { Requirement, clients, pbcLists, requirements, submissions } from '../models/types';
import { isPbcListVisibleToClient } from './pbcVisibility';

function addMonthsToRequestedDate(requestedDate?: string): string | undefined {
  const trimmed = requestedDate?.trim();
  if (!trimmed) {
    return undefined;
  }

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  date.setMonth(date.getMonth() + 3);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeRequirement(requirement: Requirement): Requirement {
  const derivedDueDate = addMonthsToRequestedDate(requirement.requestedDate);
  return {
    ...requirement,
    dueDate: derivedDueDate ?? requirement.dueDate,
  };
}

function getDefaultTrialBalanceRequirement(clientId: string): Requirement {
  const defaultRequirementId = `default-tb-${clientId}`;
  const isSubmitted = submissions.some((submission) => submission.requirementId === defaultRequirementId);

  return {
    id: defaultRequirementId,
    clientId,
    title: 'Trial balance for current audit period',
    description: 'Upload signed trial balance with ledger mapping.',
    status: isSubmitted ? 'submitted' : 'open',
  };
}

function hasTrialBalanceRequirement(clientId: string): boolean {
  return requirements.some(
    (item) => item.clientId === clientId && item.title.toLowerCase().includes('trial balance'),
  );
}

function hasUploadedPbcList(clientId: string): boolean {
  return pbcLists.some((item) => item.clientId === clientId && isPbcListVisibleToClient(item));
}

export function getEffectiveRequirementsForClient(clientId: string): Requirement[] {
  const scoped = requirements.filter((item) => item.clientId === clientId).map(normalizeRequirement);

  if (!hasUploadedPbcList(clientId) && !hasTrialBalanceRequirement(clientId)) {
    return [getDefaultTrialBalanceRequirement(clientId), ...scoped];
  }

  return scoped;
}

export function getEffectiveRequirementsForAuditor(): Requirement[] {
  const result: Requirement[] = [];

  for (const client of clients) {
    result.push(...getEffectiveRequirementsForClient(client.id));
  }

  return result;
}
