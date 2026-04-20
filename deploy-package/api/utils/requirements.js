"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEffectiveRequirementsForClient = getEffectiveRequirementsForClient;
exports.getEffectiveRequirementsForAuditor = getEffectiveRequirementsForAuditor;
const types_1 = require("../models/types");
function getDefaultTrialBalanceRequirement(clientId) {
    const defaultRequirementId = `default-tb-${clientId}`;
    const isSubmitted = types_1.submissions.some((submission) => submission.requirementId === defaultRequirementId);
    return {
        id: defaultRequirementId,
        clientId,
        title: 'Trial balance for current audit period',
        description: 'Upload signed trial balance with ledger mapping.',
        status: isSubmitted ? 'submitted' : 'open',
    };
}
function hasTrialBalanceRequirement(clientId) {
    return types_1.requirements.some((item) => item.clientId === clientId && item.title.toLowerCase().includes('trial balance'));
}
function hasUploadedPbcList(clientId) {
    return types_1.pbcLists.some((item) => item.clientId === clientId);
}
function getEffectiveRequirementsForClient(clientId) {
    const scoped = types_1.requirements.filter((item) => item.clientId === clientId);
    if (!hasUploadedPbcList(clientId) && !hasTrialBalanceRequirement(clientId)) {
        return [getDefaultTrialBalanceRequirement(clientId), ...scoped];
    }
    return scoped;
}
function getEffectiveRequirementsForAuditor() {
    const result = [];
    for (const client of types_1.clients) {
        result.push(...getEffectiveRequirementsForClient(client.id));
    }
    return result;
}
