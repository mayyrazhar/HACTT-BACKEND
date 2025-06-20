/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Contract } from 'fabric-contract-api';
import { AssetTransferContract } from './assetTransfer';
import { TestCaseContract } from './testCaseAssetTransfer';
import { UserContract } from './userAssetTransfer';
export const contracts: typeof Contract[] = [AssetTransferContract, UserContract, TestCaseContract]; 
