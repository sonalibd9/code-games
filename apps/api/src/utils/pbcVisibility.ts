import { PbcList } from '../models/types';

export function isPbcListVisibleToClient(list?: PbcList): boolean {
  if (!list) {
    return false;
  }

  return list.source !== 'auto-generated' || list.approvedForClient;
}
