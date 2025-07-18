/*
  SPDX-License-Identifier: Apache-2.0
  Smart Contract for test case management
*/

import { Object, Property } from 'fabric-contract-api';

@Object()
export class Asset {

  @Property()
  public idtest_cases: string;

  @Property()
  public test_desc: string;

  @Property()
  public deadline: string;

  // @Property()
  // public dateUpdated: string;

  @Property()
  public projectId: string;

  // @Property()
  // public reason: string;

  @Property()
  public testCaseName: string;

  @Property()
  public dateCreated: string;

  @Property()
  public overallStatus: string;

  @Property()
  public username: string;

  @Property()
  public testPlanID: string;

  @Property()
  public testSuiteID: string;

  @Property()
  public testSuiteName: string;

  @Property()
  public testSuiteDesc: string;

  @Property()
  public testSuiteStatus: string;

  @Property()
  public importance: string;

  @Property()
  public testID: string;

  @Property()
  public buildID: string;

  @Property()
  public buildTitle: string;

  @Property()
  public buildDescription: string;

  @Property()
  public isBuildActive: string;

  @Property()
  public isBuildOpen: string;

  @Property()
  public buildReleaseDate: string;

  @Property()
  public buildVersion: string;

  // @Property()
  // public createdBy: string;

  // @Property()
  // public status: string;

  /* @Property()
   public testPlan_id: string;

   @Property()
   public testPlan_desc: string;

   @Property()
   public isActive: boolean;

   @Property()
   public isPublic: boolean;

   @Property()
   public testPlan_name: string;
   */


}

@Object()
export class TestPlanAsset {
  @Property()
  public testPlanID: string;

  @Property()
  public testPlanName: string;

  @Property()
  public description: string;

  @Property()
  public isActive: string;

  @Property()
  public isPublic: string;


  @Property()
  public dateCreated: string;

  @Property()
  public updatedBy: string;

  @Property()
  public dateUpdated: string;

}

// role asset class 
@Object()
export class RoleAsset {
  @Property()
  public roleId: string;

  @Property()
  public roleName: string;

  @Property()
  public description: string;

  @Property()
  public isActive: string;
}

// User Asset class
@Object()
export class UserAsset {
  @Property()
  public userId: string;

  @Property()
  public email: string;

  @Property()
  public username: string;

  @Property()
  public password: string;

  @Property()
  public roleId: string;

  @Property()
  public resetToken: string;
}

// Test Case Asset class
@Object()
export class TestCaseAsset {
  @Property()
  public idtest_cases: string;

  @Property()
  public test_desc: string;

  @Property()
  public deadline: string;

  @Property()
  public dateUpdated: string;

  @Property()
  public projectId: string;

  @Property()
  public reason: string;

  @Property()
  public testCaseName: string;

  @Property()
  public dateCreated: string;

  @Property()
  public userID: string; // Store JSON.stringify([2001, 2002])

  @Property()
  public userStatuses: string; // Store JSON.stringify({ "Teenesh": "Approved" })

  @Property()
  public overallStatus: string;

  @Property()
  public username: string;

  @Property()
  public createdBy: string;

  @Property()
  public status: string;

  @Property()
  public userReasons: string; // Store JSON.stringify({ "Teenesh": "Needs more detail" })

  @Property()
  public tcSteps: string; // Store JSON.stringify(["Step 1", "Step 2"])

  @Property()
  public expectedResults: string; // Store JSON.stringify(["Expected A", "Expected B"])

  @Property()
  public testCaseVersion: string;
}

