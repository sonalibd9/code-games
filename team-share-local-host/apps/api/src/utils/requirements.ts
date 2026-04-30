import { Requirement, clients, pbcLists, requirements, submissions } from '../models/types';

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
  return pbcLists.some((item) => item.clientId === clientId);
}

export function getEffectiveRequirementsForClient(clientId: string): Requirement[] {
  const scoped = requirements.filter((item) => item.clientId === clientId);

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
