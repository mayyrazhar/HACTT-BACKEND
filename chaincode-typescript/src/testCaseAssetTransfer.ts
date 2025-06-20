import {
    Context,
    Contract,
    Info,
    Returns,
    Transaction,
} from "fabric-contract-api";
import { TestCaseAsset } from "./asset";

@Info({
    title: "TestCaseContract",
    description: "Smart contract for managing test cases",
})
export class TestCaseContract extends Contract {
    @Transaction()
    public async CreateTestCase(
        ctx: Context,
        idtest_cases: string,
        test_desc: string,
        deadline: string,
        dateUpdated: string,
        projectId: string,
        reason: string,
        testCaseName: string,
        dateCreated: string,
        userID: string,
        userStatuses: string,
        overallStatus: string,
        username: string,
        createdBy: string,
        status: string,
        userReasons: string,
        tcSteps: string,
        expectedResults: string
    ): Promise<void> {
        const exists = await this.TestCaseExists(ctx, idtest_cases);
        if (exists) {
            throw new Error(`The test case ${idtest_cases} already exists`);
        }

        const testCase: TestCaseAsset = {
            idtest_cases,
            test_desc,
            deadline,
            dateUpdated,
            projectId,
            reason,
            testCaseName,
            dateCreated,
            userID,
            userStatuses,
            overallStatus,
            username,
            createdBy,
            status,
            userReasons,
            tcSteps,
            expectedResults,
        };

        await ctx.stub.putState(idtest_cases, Buffer.from(JSON.stringify(testCase)));
    }

    @Transaction(false)
    @Returns("TestCaseAsset")
    public async ReadTestCase(ctx: Context, idtest_cases: string): Promise<TestCaseAsset> {
        const testCaseJSON = await ctx.stub.getState(idtest_cases);
        if (!testCaseJSON || testCaseJSON.length === 0) {
            throw new Error(`The test case ${idtest_cases} does not exist`);
        }
        return JSON.parse(testCaseJSON.toString()) as TestCaseAsset;
    }

    @Transaction()
    public async UpdateTestCase(
        ctx: Context,
        idtest_cases: string,
        test_desc: string,
        deadline: string,
        dateUpdated: string,
        projectId: string,
        reason: string,
        testCaseName: string,
        dateCreated: string,
        userID: string,
        userStatuses: string,
        overallStatus: string,
        username: string,
        createdBy: string,
        status: string,
        userReasons: string,
        tcSteps: string,
        expectedResults: string
    ): Promise<void> {
        const exists = await this.TestCaseExists(ctx, idtest_cases);
        if (!exists) {
            throw new Error(`The test case ${idtest_cases} does not exist`);
        }

        const updated: TestCaseAsset = {
            idtest_cases,
            test_desc,
            deadline,
            dateUpdated,
            projectId,
            reason,
            testCaseName,
            dateCreated,
            userID,
            userStatuses,
            overallStatus,
            username,
            createdBy,
            status,
            userReasons,
            tcSteps,
            expectedResults,
        };

        await ctx.stub.putState(idtest_cases, Buffer.from(JSON.stringify(updated)));
    }

    @Transaction()
    public async DeleteTestCase(ctx: Context, idtest_cases: string): Promise<void> {
        const exists = await this.TestCaseExists(ctx, idtest_cases);
        if (!exists) {
            throw new Error(`The test case ${idtest_cases} does not exist`);
        }
        await ctx.stub.deleteState(idtest_cases);
    }

    @Transaction(false)
    @Returns("TestCaseAsset[]")
    public async GetAllTestCases(ctx: Context): Promise<TestCaseAsset[]> {
        const results: TestCaseAsset[] = [];
        const iterator = await ctx.stub.getStateByRange("", "");

        let result = await iterator.next();
        while (!result.done) {
            const strValue = result.value.value.toString();
            try {
                const record = JSON.parse(strValue);
                if (record.idtest_cases && record.testCaseName) {
                    results.push(record as TestCaseAsset);
                }
            } catch (e) {
                console.error("Error parsing test case:", e);
            }
            result = await iterator.next();
        }

        return results;
    }

    @Transaction(false)
    @Returns("boolean")
    public async TestCaseExists(ctx: Context, idtest_cases: string): Promise<boolean> {
        const buffer = await ctx.stub.getState(idtest_cases);
        return !!(buffer && buffer.length > 0);
    }
}
