/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as grpc from '@grpc/grpc-js';
import { connect, Contract, Identity, Signer, signers } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { TextDecoder } from 'util';

const channelName = envOrDefault('CHANNEL_NAME', 'mychannel');
const chaincodeName = envOrDefault('CHAINCODE_NAME', 'basic');
const mspId = envOrDefault('MSP_ID', 'Org1MSP');

// Path to crypto materials.
const cryptoPath = envOrDefault('CRYPTO_PATH', path.resolve(__dirname, '..', '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com'));

// Path to user private key directory.
const keyDirectoryPath = envOrDefault('KEY_DIRECTORY_PATH', path.resolve(cryptoPath, 'users', 'User1@org1.example.com', 'msp', 'keystore'));

// Path to user certificate.
const certPath = envOrDefault('CERT_PATH', path.resolve(cryptoPath, 'users', 'User1@org1.example.com', 'msp', 'signcerts', 'User1@org1.example.com-cert.pem'));

// Path to peer tls certificate.
const tlsCertPath = envOrDefault('TLS_CERT_PATH', path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt'));

// Gateway peer endpoint.
const peerEndpoint = envOrDefault('PEER_ENDPOINT', 'localhost:7051');

// Gateway peer SSL host name override.
const peerHostAlias = envOrDefault('PEER_HOST_ALIAS', 'peer0.org1.example.com');

const utf8Decoder = new TextDecoder();
const assetId = `asset${Date.now()}`;

// define express connection in Hyperledger Fabric
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
app.use(bodyParser.urlencoded({ extended: true }));


async function main(): Promise<void> {

    await displayInputParameters();

    // The gRPC client connection should be shared by all Gateway connections to this endpoint.
    const client = await newGrpcConnection();

    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        // Default timeouts for different gRPC calls
        evaluateOptions: () => {
            return { deadline: Date.now() + 300000 }; // 3 minute
        },
        endorseOptions: () => {
            return { deadline: Date.now() + 300000 }; // 3 minute
        },
        submitOptions: () => {
            return { deadline: Date.now() + 300000 }; // 3 minute
        },
        commitStatusOptions: () => {
            return { deadline: Date.now() + 300000 }; // 3 minute
        },
    });

    try {
        // Get a network instance representing the channel where the smart contract is deployed.
        const network = gateway.getNetwork(channelName);

        // Get the smart contract from the network.
        const contract = network.getContract(chaincodeName);

        // Initialize a set of asset data on the ledger using the chaincode 'InitLedger' function.
        // await initLedger(contract);

        // Return all the current assets on the ledger.
        // await getAllAssets(contract);

        app.get('/', (req: any, res: any) => {
            res.send('Hello World!')
        })

        app.get('/test', (req: any, res: any) => {
            res.send("test")
        })

        // Middleware to log incoming requests
        app.use((req: any, res: any, next: any) => {
            const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" });
            console.log(`Received ${req.method} request for ${req.url} on ${now} -`);
            next(); // Pass control to the next handler
        });

        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(bodyParser.json());

        // app.get('/initLedger', async (req: any, res: any) => {
        //     await initLedger(contract); // calls InitLedger function from smart contract
        //     const successMessage = { status: 'success', message: '*** Transaction initLedger committed successfully' };
        //     res.send(JSON.stringify(successMessage));
        // })

        app.get('/getAllTestCases', async (req: any, res: any) => {
            const allResults = await getAllTestCases(contract);
            const successMessage = { status: 'success', message: allResults };
            res.send(JSON.stringify(successMessage));
        })

        app.get('/getAllTestCasesWithHistory', async (req: any, res: any) => {
            try {
                const allResults = await getAllTestCasesWithHistory(contract);
                const successMessage = { status: 'success', message: allResults };
                res.send(JSON.stringify(successMessage)); // Only response sent
            } catch (error) {
                console.error('Error fetching test cases:', error);
                res.status(500).json({ status: 'error', message: 'Failed to fetch test cases' });
            }
        });

        app.get('/getAllTestPlans', async (req: any, res: any) => {
            try {
                const allResults = await getAllTestPlans(contract);
                const successMessage = { status: 'success', message: allResults };

                // Explicitly set the Content-Type header to application/json
                res.setHeader('Content-Type', 'application/json');
                res.status(200).json(successMessage);
            } catch (error) {
                console.error("Error retrieving test plans:", error);

                // Return an error response as JSON
                res.setHeader('Content-Type', 'application/json');
                res.status(500).json({ status: 'error', message: 'Failed to retrieve test plans', error: error.message });
            }
        });


        app.get('/getAllTestPlansWithHistory', async (req: any, res: any) => {
            try {
                const allResults = await getAllTestPlansWithHistory(contract);
                const successMessage = { status: 'success', message: allResults };
                res.send(JSON.stringify(successMessage)); // Only response sent
            } catch (error) {
                console.error('Error fetching test cases:', error);
                res.status(500).json({ status: 'error', message: 'Failed to fetch test cases' });
            }
        });

        // Create a new asset on the ledger.
        app.post('/createTestCase', async (req: any, res: any) => {
            console.log("Create Test Case:")
            console.log(req.body);

            try {
                await createAsset(contract, req.body.id, req.body.tcdesc, req.body.dl, req.body.pid,
                    req.body.tcn, req.body.dtc, req.body.usrn, req.body.ostts, req.body.tpID);
                const successMessage = { status: 'success', message: '*** Transaction createAsset committed successfully' };
                res.send(JSON.stringify(successMessage));
            } catch (error) {
                console.error('Error creating test case:', error);
                res.status(500).json({ error: error.message });
            }

        })

        // Update a test case
        app.post('/updateTestCase', async (req: any, res: any) => {
            console.log('Received request body:', req.body);

            // Check if required fields (id) are present
            if (!req.body.id) {
                return res.status(400).json({ error: 'Missing required field: id' });
            }
            console.log("Update Test Case:")
            console.log(req.body);

            try {
                await UpdateAsset(contract, req.body.id, req.body.tcdesc, req.body.dl, req.body.pid,
                    req.body.tcn, req.body.dtc, req.body.usrn, req.body.ostts);
                const successMessage = { status: 'success', message: 'Test case updated successfully' };
                res.send(JSON.stringify(successMessage));
            } catch (error) {
                console.error('Error updating test case:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Update overall status of a test case
        app.post('/updateTestCaseStatus', async (req: any, res: any) => {
            console.log('Received request body:', req.body);

            // Check if required fields (id) are present
            if (!req.body.id) {
                return res.status(400).json({ error: 'Missing required field: id' });
            }
            console.log("Update Test Case Status:")
            console.log(req.body);

            try {
                await UpdateTestCaseStatus(contract, req.body.id, req.body.ostts);
                const successMessage = { status: 'success', message: 'Test case status updated successfully' };
                res.send(JSON.stringify(successMessage));
            } catch (error) {
                console.error('Error updating test case status:', error);
                res.status(500).json({ error: 'Failed to update test case status' });
            }
        });

        // Get test case by ID
        app.post('/readTestCaseByID', async (req: any, res: any) => {
            console.log('Received request body:', req.body);
            // Check if ID is present in the request body
            if (!req.body.id) {
                return res.status(400).json({ error: 'Missing required field: id' });
            }
            const testCaseID = req.body.id;
            try {
                const result = await readTestCaseByID(contract, testCaseID);
                const successMessage = { status: 'success', message: result };
                res.send(JSON.stringify(successMessage));
            } catch (error) {
                console.error('Error reading test case by ID:', error);
                res.status(500).json({ error: 'Failed to retrieve test case' });
            }

        })

        // Delete a test case
        app.delete('/deleteTestCase', async (req: any, res: any) => {
            console.log('Received request body:', req.body);
            // Check if ID is present in the request body
            if (!req.body.id) {
                return res.status(400).json({ error: 'Missing required field: id' });
            }
            // const testCaseID = req.body.id;
            try {
                await deleteTestCase(contract, req.body.id);
                const successMessage = { status: 'success', message: 'Test case deleted successfully' };
                res.send(JSON.stringify(successMessage));
            } catch (error) {
                console.error('Error deleting test case:', error);
                res.status(500).json({ error: 'Failed to delete test case' });
            }
        })

        //create test plan
        app.post('/createTestPlan', async (req: any, res: any) => {
            console.log("Create Test Plan:")
            console.log(req.body);
            try {
                await createTestPlan(contract, req.body.tpID, req.body.tpName, req.body.tpDesc, req.body.createdBy,
                    req.body.dateCreated, req.body.isActive, req.body.isPublic);
                const successMessage = { status: 'success', message: '*** Transaction createAsset committed successfully' };
                res.send(JSON.stringify(successMessage));
            } catch (error) {
                console.error(`Failed to create test plan: ${error}`);
                res.status(500).json({ error: error.message });
            }
        });

        app.get('/getLatestTestPlanID', async (req: any, res: any) => {
            try {
                // Call the GetLatestTestPlanID method in your chaincode
                const latestID = await GetLatestTestPlanID(contract); // Replace 'contract' with your actual contract object

                // Ensure the result is a string (it could be a Buffer, so we convert it to a string)
                const latestIDString = latestID.toString().trim(); // Use .trim() to remove any extra spaces or newline chars

                // Handle the case where there is no test plan ID or if the result is invalid
                if (!latestIDString || latestIDString === 'No test plans found') {
                    return res.status(404).json({ error: 'No test plans found or ID could not be determined' });
                }

                // Return the latest test plan ID as a JSON response
                return res.json({ latestTestPlanID: latestIDString.toString() });
            } catch (error) {
                console.error('Error fetching latest test plan ID:', error);
                res.status(500).json({ error: error.message });
            }
        });



        //delete test plan
        app.delete('/deleteTestPlan', async (req: any, res: any) => {
            console.log('Received request body:', req.body);
            // Check if ID is present in the request body
            if (!req.body.tpID) {
                return res.status(400).json({ error: 'Missing required field: id' });
            }
            // const testCaseID = req.body.id;
            try {
                await deleteTestPlan(contract, req.body.tpID);
                const successMessage = { status: 'success', message: 'Test Plan deleted successfully' };
                res.send(JSON.stringify(successMessage));
            } catch (error) {
                console.error('Error deleting test plan:', error);
                res.status(500).json({ error: 'Failed to delete test plan' });
            }
        })

        app.get('/getTestPlanById/:id', async (req: any, res: any) => {
            try {
                const testPlanID = req.params.id;

                if (!testPlanID) {
                    return res.status(400).json({ error: 'Missing required path parameter: id' });
                }

                const testPlanDetails = await GetTestPlanById(contract, testPlanID);
                res.status(200).json(testPlanDetails);
            } catch (error) {
                console.error('Error fetching test plan:', error.message);

                if (error.message.includes('does not exist')) {
                    res.status(404).json({ error: "Test Plan with ID ${req.params.id} does not exist. " });
                } else {
                    res.status(500).json({ error: 'Failed to retrieve test plan.' });
                }
            }
        });

        //update test plan
        app.post('/updateTestPlan', async (req: any, res: any) => {
            console.log('Received request body:', req.body);

            // Check if required fields (id) are present
            if (!req.body.tpID) {
                return res.status(400).json({ error: 'Missing required field: id' });
            }
            console.log("Update Test Plan:")
            console.log(req.body);

            try {
                await UpdateTestPlan(contract, req.body.tpID, req.body.tpName, req.body.tpDesc, req.body.createdBy, req.body.dateCreated, req.body.updatedBy, req.body.dateUpdated, req.body.isActive, req.body.isPublic);
                const successMessage = { status: 'success', message: 'Test plan updated successfully' };
                res.send(JSON.stringify(successMessage));
            } catch (error) {
                console.error('Error updating test plan:', error);
                res.status(500).json({ error: error.message });
            }
        });


        // returns the ID associated with the invoking identity.
        app.get('/getClientID', async (req: any, res: any) => {
            await getClientID(contract);
            const successMessage = { status: 'success', message: '*** Transaction getClientID committed successfully' };
            res.send(JSON.stringify(successMessage));
        })

        // assign test case
        /*app.post('/assignTestCaseToTestPlan', async (req: any, res: any) => {
            console.log("Assign test case to test plan:")
            console.log(req.body);
            try {
                await assignTestCaseToTestPlan(contract, req.body.id, req.body.tpID);
                res.status(200).json({ status: 'success' });
            } catch (error) {
                console.error('Error assigning test case to test plan:', error);
                res.status(500).json({ error: error.message });
            }
        });*/

        app.listen(port, () => {
            console.log(`Example app listening on port ${port}`)
        })

        // console.log(`Example app listening on port`)

        // Create a new asset on the ledger.
        // await initLedger(contract);

        // Create a new asset on the ledger.
        // await createAsset(contract);

        // Get all test cases on the ledger.
        await getAllTestCases(contract);

        await getAllTestCasesWithHistory(contract);

        await getAllTestPlans(contract);

        await getAllTestPlansWithHistory(contract);

        //await GetTestPlanById(contract, testPlanID)

        await GetLatestTestPlanID(contract);
        // Update an existing asset asynchronously.
        // await transferAssetAsync(contract);

        // Get the asset details by assetID.
        // await readAssetByID(contract);

        // Update an asset which does not exist.
        // await updateNonExistentAsset(contract)
        // returns the ID associated with the invoking identity.
        await getClientID(contract);
    } finally {
        // gateway.close();
        // client.close();
    }
}

main().catch(error => {
    console.error('******** FAILED to run the application:', error);
    process.exitCode = 1;
});

async function newGrpcConnection(): Promise<grpc.Client> {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

async function newIdentity(): Promise<Identity> {
    const credentials = await fs.readFile(certPath);
    return { mspId, credentials };
}

async function newSigner(): Promise<Signer> {
    const files = await fs.readdir(keyDirectoryPath);
    const keyPath = path.resolve(keyDirectoryPath, files[0]);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

/**
 * This type of transaction would typically only be run once by an application the first time it was started after its
 * initial deployment. A new version of the chaincode deployed later would likely not need to run an "init" function.
//  */
// async function initLedger(contract: Contract): Promise<void> {
//     console.log('\n--> Submit Transaction: InitLedger, function creates the initial set of assets on the ledger');

//     await contract.submitTransaction('InitLedger');

//     console.log('*** Transaction committed successfully');
// }

/**
 * Evaluate a transaction to query ledger state.
 */
async function getAllTestCases(contract: Contract): Promise<void> {
    console.log('\n--> Evaluate Transaction: GetAllTestCases, function returns all the current test cases on the ledger');

    const resultBytes = await contract.evaluateTransaction('GetAllAssets');

    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('*** Result:', result);
    return result;
}


async function getAllTestCasesWithHistory(contract: Contract): Promise<void> {
    console.log('\n--> Evaluate Transaction: GetAllTestCasesWithHistory, function returns all the current test cases with their history on the ledger');

    const resultBytes = await contract.evaluateTransaction('GetAllAssetsWithHistory');

    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);

    // Filter assets that have the property `idtest_cases`
    const filteredAssets = result.filter(
        (asset: any) => asset.history[0]?.Value?.idtest_cases !== undefined
    );

    console.log('*** Result:', filteredAssets);
    return filteredAssets;
}

/**
 * Submit a transaction synchronously, blocking until it has been committed to the ledger.
 */
async function createAsset(contract: Contract, id: string, tcdesc: string, dl: string, pid: string,
    tcn: string, dtc: string, usrn: string, ostts: string, tpID: string): Promise<void> {
    console.log('\n--> Submit Transaction: CreateAsset, creates new asset with ID, Project ID, etc arguments');

    // Convert uid array to JSON string
    // const uidJson = JSON.stringify(uid);

    await contract.submitTransaction(
        'CreateAsset',
        id,
        tcdesc,
        dl,
        pid,
        tcn,
        dtc,
        usrn,
        ostts,
        tpID,
        // uid
        // stts,

    );

    console.log('*** Transaction committed successfully');
}

//function get
async function getAllTestPlans(contract: Contract): Promise<void> {
    console.log('\n--> Evaluate Transaction: GetAllTestPlans, function returns all the current test cases on the ledger');

    const resultBytes = await contract.evaluateTransaction('GetAllTestPlan');
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('*** Result:', result);
    return result;
}

async function getAllTestPlansWithHistory(contract: Contract): Promise<void> {
    console.log('\n--> Evaluate Transaction: GetAllTestPlansWithHistory, function returns all the current test plans with their history on the ledger');

    const resultBytes = await contract.evaluateTransaction('GetAllAssetsWithHistory');

    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);

    // Filter assets that have the property idtest_cases
    const filteredAssets = result.filter(
        (asset: any) => asset.history[0]?.Value?.testPlanID !== undefined
    );

    console.log('*** Result:', filteredAssets);
    return filteredAssets;
}

async function GetLatestTestPlanID(contract: Contract): Promise<string> {
    try {
        console.log('\n--> Evaluate Transaction: GetLatestTestPlanID, fetching the latest test plan ID');

        // Call the chaincode function to get the latest test plan ID
        const resultBytes = await contract.evaluateTransaction('GetLatestTestPlanID');

        // Decode the result (assuming it's a Buffer)
        const resultJson = utf8Decoder.decode(resultBytes).trim(); // Trim any extra spaces or newline chars

        // If the result is empty or invalid, handle accordingly
        if (!resultJson || resultJson === 'No test plans found') {
            throw new Error('No test plans found or unable to determine the latest ID');
        }

        console.log('*** Latest Test Plan ID:', resultJson);

        // Return the latest test plan ID as a string
        return resultJson;
    } catch (error) {
        console.error('Error fetching latest test plan ID:', error);
        throw new Error(`Failed to fetch latest test plan ID: ${error.message}`);
    }
}


async function GetTestPlanById(contract: Contract, testPlanID: string): Promise<any> {
    console.log("\n--> Evaluate Transaction: GetTestPlanById, fetching test plan details for ID: ${testPlanID}");

    try {
        // Evaluate the transaction to query the test plan by ID
        const resultBytes = await contract.evaluateTransaction('GetTestPlanById', testPlanID);

        // Decode the response and parse the JSON
        const resultJson = utf8Decoder.decode(resultBytes);
        const result = JSON.parse(resultJson);

        console.log('* Result:', result);
        return result;
    } catch (error) {
        console.error("Error fetching Test Plan with ID ${testPlanID}:", error);
        throw new Error(`Failed to fetch Test Plan with ID ${testPlanID}. Error: ${error.message}`);

    }
}

//function test plan
async function createTestPlan(contract: Contract, tpID: string, tpName: string, tpDesc: string, createdBy: string, dateCreated: string, isActive: string, isPublic: string): Promise<void> {
    console.log('\n--> Submit Transaction: CreateTestPlan, creates new asset with ID, Project ID, etc arguments');

    // Convert uid array to JSON string
    // const uidJson = JSON.stringify(uid);

    await contract.submitTransaction(
        'CreateTestPlan',
        tpID,
        tpName,
        tpDesc,
        createdBy,
        dateCreated,
        isActive,
        isPublic,
    );

    console.log('*** Test Plan committed successfully');
}

// Update Test Case Function
async function UpdateAsset(contract: Contract, id: string, tcdesc: string, dl: string, pid: string,
    tcn: string, dtc: string, usrn: string, ostts: string): Promise<void> {
    console.log('\n--> Submit Transaction: UpdateTestCase, updates an existing test case on the ledger');

    // Convert uid array to JSON string (if applicable)
    // const uidJson = JSON.stringify(uid);

    await contract.submitTransaction(
        'UpdateAsset',
        id,
        tcdesc,
        dl,
        pid,
        tcn,
        dtc,
        usrn,
        ostts,
        // uid
        // stts, // Include status if necessary
    );

    console.log('*** Transaction committed successfully (Test Case updated)');
}

// update test plan
async function UpdateTestPlan(contract: Contract, tpID: string, tpName: string, tpDesc: string, createdBy: string, dateCreated: string, updatedBy: string, dateUpdated: string, isActive: string, isPublic: string): Promise<void> {
    console.log('\n--> Submit Transaction: UpdateTestCase, updates an existing test case on the ledger');

    // Convert uid array to JSON string (if applicable)
    // const uidJson = JSON.stringify(uid);

    await contract.submitTransaction(
        'UpdateTestPlan',
        tpID,
        tpName,
        tpDesc,
        createdBy,
        dateCreated,
        updatedBy,
        dateUpdated,
        isActive,
        isPublic,
    );

    console.log('*** Transaction committed successfully (Test Plan updated)');
}


// update only overall status of the asset
async function UpdateTestCaseStatus(contract: Contract, id: string, ostts: string): Promise<void> {
    console.log('\n--> Submit Transaction: UpdateTestCaseStatus, updates the overall status of a test case on the ledger');
    //finish the code
    await contract.submitTransaction(
        'UpdateStatus',
        id,
        ostts,
    );

    console.log('*** Transaction committed successfully (Overall Status updated)');
}
/**
 * Submit transaction asynchronously, allowing the application to process the smart contract response (e.g. update a UI)
 * while waiting for the commit notification.
 */
async function transferAssetAsync(contract: Contract): Promise<void> {
    console.log('\n--> Async Submit Transaction: TransferAsset, updates existing asset owner');

    const commit = await contract.submitAsync('TransferAsset', {
        arguments: [assetId, 'Saptha'],
    });
    const oldOwner = utf8Decoder.decode(commit.getResult());

    console.log(`*** Successfully submitted transaction to transfer ownership from ${oldOwner} to Saptha`);
    console.log('*** Waiting for transaction commit');

    const status = await commit.getStatus();
    if (!status.successful) {
        throw new Error(`Transaction ${status.transactionId} failed to commit with status code ${status.code} `);
    }

    console.log('*** Transaction committed successfully');
}

async function readTestCaseByID(contract: Contract, id: string): Promise<void> {
    console.log('\n--> Evaluate Transaction: ReadAsset, function returns asset attributes');

    const resultBytes = await contract.evaluateTransaction('ReadAsset', id);

    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('*** Result:', result);
    return result;
}

// returns the getID associated with the invoking identity.
async function getClientID(contract: Contract): Promise<string> {
    console.log('\n--> Evaluate Transaction: GetClientID, function returns the ID associated with the invoking identity');

    const resultBytes = await contract.evaluateTransaction('GetID');
    const clientID = utf8Decoder.decode(resultBytes);
    //   const clientID = JSON.parse(resultJson);
    console.log('*** Client ID:', clientID);
    return clientID; // Assuming you want to return the ID
}

// async function readAssetByID(contract: Contract): Promise<void> {
//     console.log('\n--> Evaluate Transaction: ReadAsset, function returns asset attributes');

//     const resultBytes = await contract.evaluateTransaction('ReadAsset', assetId);

//     const resultJson = utf8Decoder.decode(resultBytes);
//     const result = JSON.parse(resultJson);
//     console.log('*** Result:', result);
// }

// DeleteTestCase deletes an asset from the ledger
async function deleteTestCase(contract: Contract, id: string): Promise<void> {
    console.log('\n--> Submit Transaction: DeleteAsset, function deletes asset from the ledger');

    // Submit transaction to delete the asset
    await contract.submitTransaction('DeleteAsset', id);

    console.log('*** Transaction committed successfully (Test Case deleted)');
}

// DELETE TEST PLAN
async function deleteTestPlan(contract: Contract, tpID: string): Promise<void> {
    console.log('\n--> Submit Transaction: DeleteTestPlan, function deletes test plan from the ledger');

    // Submit transaction to delete the asset
    await contract.submitTransaction('DeleteTestPlan', tpID);

    console.log('*** Transaction committed successfully (Test Case deleted)');
}

/**
 * submitTransaction() will throw an error containing details of any error responses from the smart contract.
 */
async function updateNonExistentAsset(contract: Contract): Promise<void> {
    console.log('\n--> Submit Transaction: UpdateAsset asset70, asset70 does not exist and should return an error');

    try {
        await contract.submitTransaction(
            'UpdateAsset',
            'asset70',
            'blue',
            '5',
            'Tomoko',
            '300',
        );
        console.log('******** FAILED to return an error');
    } catch (error) {
        console.log('*** Successfully caught the error: \n', error);
    }
}

/**
 * envOrDefault() will return the value of an environment variable, or a default value if the variable is undefined.
 */
function envOrDefault(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
}

/**
 * displayInputParameters() will print the global scope parameters used by the main driver routine.
 */
async function displayInputParameters(): Promise<void> {
    console.log(`channelName:       ${channelName} `);
    console.log(`chaincodeName:     ${chaincodeName} `);
    console.log(`mspId:             ${mspId} `);
    console.log(`cryptoPath:        ${cryptoPath} `);
    console.log(`keyDirectoryPath:  ${keyDirectoryPath} `);
    console.log(`certPath:          ${certPath} `);
    console.log(`tlsCertPath:       ${tlsCertPath} `);
    console.log(`peerEndpoint:      ${peerEndpoint} `);
    console.log(`peerHostAlias:     ${peerHostAlias} `);
}

/*async function assignTestCaseToTestPlan(contract: Contract, id: string, tpID: string): Promise<void> {
    console.log('\n--> Submit Transaction: AssignTestCaseToTestPlan');

    await contract.submitTransaction('AssignTestCaseToTestPlan', id, tpID);

    console.log('*** Test Case assigned to Test Plan successfully');
}*/

