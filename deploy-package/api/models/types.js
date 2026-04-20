"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifications = exports.pbcItemFiles = exports.pbcItems = exports.pbcLists = exports.submissions = exports.requirements = exports.users = exports.clients = void 0;
exports.clients = [
    { id: 'c1', name: 'Alpha Listed Co.', entityType: 'listed-entity' },
    { id: 'c2', name: 'Beta Subsidiary Pvt. Ltd.', entityType: 'subsidiary' },
    { id: 'c3', name: 'Gamma JV LLP', entityType: 'joint-venture' },
    { id: 'c4', name: 'Delta Body Corporate', entityType: 'body-corporate' },
];
exports.users = [
    { id: 'u1', email: 'auditor@firm.com', password: 'Auditor@123', role: 'auditor' },
    { id: 'u2', email: 'client.alpha@entity.com', password: 'Client@123', role: 'client', clientId: 'c1' },
    { id: 'u3', email: 'client.beta@entity.com', password: 'Client@123', role: 'client', clientId: 'c2' },
];
exports.requirements = [
    {
        id: 'r1',
        clientId: 'c1',
        title: 'Trial balance for FY 2025-26',
        description: 'Upload signed trial balance with ledger mapping.',
        dueDate: '2026-04-30',
        status: 'open',
    },
];
exports.submissions = [];
exports.pbcLists = [];
exports.pbcItems = [];
exports.pbcItemFiles = [];
exports.notifications = [];
