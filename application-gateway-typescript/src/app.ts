/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

//Test Havi

import * as grpc from "@grpc/grpc-js";
import HttpError from "./utils/customError";
import {
  connect,
  Contract,
  Identity,
  Signer,
  signers,
  StatusCode,
} from "@hyperledger/fabric-gateway";
import * as crypto from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { TextDecoder } from "util";

let channelName = envOrDefault("CHANNEL_NAME", "mychannel");
let chaincodeName = envOrDefault("CHAINCODE_NAME", "basic");
const mspId = envOrDefault("MSP_ID", "Org1MSP");

// Path to crypto materials.
const cryptoPath = envOrDefault(
  "CRYPTO_PATH",
  path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "test-network",
    "organizations",
    "peerOrganizations",
    "org1.example.com"
  )
);

// Path to user private key directory.
const keyDirectoryPath = envOrDefault(
  "KEY_DIRECTORY_PATH",
  path.resolve(cryptoPath, "users", "User1@org1.example.com", "msp", "keystore")
);

// Path to user certificate.
const certPath = envOrDefault(
  "CERT_PATH",
  path.resolve(
    cryptoPath,
    "users",
    "User1@org1.example.com",
    "msp",
    "signcerts",
    "User1@org1.example.com-cert.pem"
  )
);

// Path to peer tls certificate.
const tlsCertPath = envOrDefault(
  "TLS_CERT_PATH",
  path.resolve(cryptoPath, "peers", "peer0.org1.example.com", "tls", "ca.crt")
);

// Gateway peer endpoint.
const peerEndpoint = envOrDefault("PEER_ENDPOINT", "localhost:7051");

// Gateway peer SSL host name override.
const peerHostAlias = envOrDefault("PEER_HOST_ALIAS", "peer0.org1.example.com");

const utf8Decoder = new TextDecoder();
const assetId = `asset${Date.now()}`;

// define express connection in Hyperledger Fabric
const express = require("express");
const bodyParser = require("body-parser");
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
    let network = gateway.getNetwork(channelName); // Global network variable
    let contract; // Global contract variable

    // Initialize network and contract based on the current channelName and chaincodeName
    const initializeNetworkAndContract = async () => {
      try {
        network = gateway.getNetwork(channelName); // Initialize the network
        contract = network.getContract(chaincodeName); // Initialize the contract
        console.log(
          `Connected to channel: ${channelName}, chaincode: ${chaincodeName}`
        );
      } catch (error) {
        console.error("Error initializing network and contract:", error);
      }
    };

    // Call initializeNetworkAndContract initially to set up the global variables
    initializeNetworkAndContract();

    app.get("/", (req: any, res: any) => {
      res.send("Hello World!");
    });

    // Middleware to log incoming requests
    app.use((req: any, res: any, next: any) => {
      const now = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Singapore",
      });
      console.log(`Received ${req.method} request for ${req.url} on ${now} -`);
      next(); // Pass control to the next handler
    });

    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());

    // Route to change the channel and chaincode dynamically
    app.post("/setChannelAndChaincode", async (req: any, res: any) => {
      const { newChannel, newChaincode } = req.body; // Expecting newChannel and newChaincode in the request body

      if (!newChannel || !newChaincode) {
        return res
          .status(400)
          .send({ error: "Channel name and chaincode name are required" });
      }

      channelName = newChannel; // Update the channelName dynamically
      chaincodeName = newChaincode; // Update the chaincodeName dynamically
      await initializeNetworkAndContract(); // Reinitialize the network and contract

      console.log(
        `Channel and chaincode updated to: ${channelName}, ${chaincodeName}`
      );
      res.send({
        message: `Channel and chaincode set to: ${channelName}, ${chaincodeName}`,
      });
    });

    // app.get('/initLedger', async (req: any, res: any) => {
    //     await initLedger(contract); // calls InitLedger function from smart contract
    //     const successMessage = { status: 'success', message: '*** Transaction initLedger committed successfully' };
    //     res.send(JSON.stringify(successMessage));
    // })

    app.get("/getAllTestCases", async (req: any, res: any) => {
      try {
        // Fetch all test cases from the contract
        const allResults = await getAllTestCases(contract);

        // Log the number of test cases retrieved
        console.log(`Retrieved ${allResults.length} test cases`);

        // Prepare a structured success message with the results
        const successMessage = {
          status: "success",
          message: "Test cases retrieved successfully",
          data: allResults, // Include the actual test cases in the response
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(200).json(successMessage); // Send the success response
      } catch (error) {
        console.error("Error fetching test cases:", error);

        // Prepare the error message with detailed information
        const errorMessage = {
          status: "error",
          message: "Failed to fetch test cases",
          error: error instanceof Error ? error.message : "Unknown error", // Handle non-standard errors gracefully
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(500).json(errorMessage); // Send the error response
      }
    });

    app.get("/getAllTestCasesWithHistory", async (req: any, res: any) => {
      try {
        // Fetch all test cases with history from the contract
        const allResults = await getAllTestCasesWithHistory(contract);

        // Log the number of test cases retrieved for debugging purposes
        console.log(`Retrieved ${allResults.length} test cases with history`);

        // Prepare the success message with a structured response
        const successMessage = {
          status: "success",
          message: "Test cases with history retrieved successfully",
          data: allResults, // Include the actual data in the response
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(200).json(successMessage); // Send the structured response
      } catch (error) {
        console.error("Error fetching test cases:", error);

        // Prepare the error response with detailed error message
        const errorMessage = {
          status: "error",
          message: "Failed to fetch test cases",
          error: error instanceof Error ? error.message : "Unknown error", // Handle non-standard errors gracefully
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(500).json(errorMessage); // Send error response
      }
    });

    app.get("/getAllTestPlans", async (req: any, res: any) => {
      try {
        // Fetch all test plans from the contract
        const allResults = await getAllTestPlans(contract);

        // Log the number of test plans retrieved for debugging purposes
        console.log(`Retrieved ${allResults.length} test plans`);

        // Prepare the success message with a structured response
        const successMessage = {
          status: "success",
          message: "Test plans retrieved successfully",
          data: allResults, // Include the actual data in the response
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(200).json(successMessage); // Send the structured response
      } catch (error) {
        console.error("Error fetching test plans:", error);

        // Prepare the error response with detailed error message
        const errorMessage = {
          status: "error",
          message: "Failed to retrieve test plans",
          error: error instanceof Error ? error.message : "Unknown error", // Handle non-standard errors gracefully
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(500).json(errorMessage); // Send error response
      }
    });

    app.get("/getAllTestPlansWithHistory", async (req: any, res: any) => {
      try {
        // Fetch all test plans with history from the contract
        const allResults = await getAllTestPlansWithHistory(contract);

        // Log the number of test plans retrieved for debugging purposes
        console.log(`Retrieved ${allResults.length} test plans with history`);

        // Prepare the success message with a structured response
        const successMessage = {
          status: "success",
          message: "Test plans with history retrieved successfully",
          data: allResults, // Include the actual data in the response
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(200).json(successMessage); // Send the structured response
      } catch (error) {
        console.error("Error fetching test plans with history:", error);

        // Prepare the error response with detailed error message
        const errorMessage = {
          status: "error",
          message: "Failed to fetch test plans with history",
          error: error instanceof Error ? error.message : "Unknown error", // Handle non-standard errors gracefully
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(500).json(errorMessage); // Send error response
      }
    });

    //getAllTestSuites
    app.get("/getAllTestSuites", async (req: any, res: any) => {
      try {
        // Fetch all test suites from the contract
        const allResults = await getAllTestSuites(contract);

        // Log the number of test suites retrieved for debugging purposes
        console.log(`Retrieved ${allResults.length} test suites`);

        // Prepare the success message with a structured response
        const successMessage = {
          status: "success",
          message: "Test suites retrieved successfully",
          data: allResults, // Include the actual data in the response
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(200).json(successMessage); // Send the structured response
      } catch (error) {
        console.error("Error retrieving test suites:", error);

        // Prepare the error response with detailed error message
        const errorMessage = {
          status: "error",
          message: "Failed to retrieve test suites",
          error: error instanceof Error ? error.message : "Unknown error", // Handle non-standard errors gracefully
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(500).json(errorMessage); // Send error response
      }
    });

    app.get("/getAllBuildsWithHistory", async (req: any, res: any) => {
      try {
        // Fetch all builds with history from the contract
        const allResults = await getAllBuildsWithHistory(contract);

        // Log the number of builds retrieved for debugging purposes
        console.log(`Retrieved ${allResults.length} builds with history`);

        // Prepare the success message with a structured response
        const successMessage = {
          status: "success",
          message: "Builds with history retrieved successfully",
          data: allResults, // Include the actual data in the response
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(200).json(successMessage); // Send a structured response
      } catch (error) {
        console.error("Error fetching builds with history:", error);

        // Prepare the error response with detailed error message
        const errorMessage = {
          status: "error",
          message: "Failed to fetch builds with history",
          error: error instanceof Error ? error.message : "Unknown error", // Handle non-standard errors gracefully
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(500).json(errorMessage); // Send error response
      }
    });

    //getAllTestSuites
    app.get("/getAllBuilds", async (req: any, res: any) => {
      try {
        // Fetch all builds from the contract
        const allResults = await getAllBuilds(contract);

        // Log the number of builds retrieved for debugging purposes
        console.log(`Retrieved ${allResults.length} builds`);

        // Prepare the success message
        const successMessage = {
          status: "success",
          message: "Builds retrieved successfully",
          data: allResults, // Include the actual build data in the response
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(200).json(successMessage);
      } catch (error) {
        console.error("Error retrieving builds:", error);

        // Prepare the error response with additional details
        const errorMessage = {
          status: "error",
          message: "Failed to retrieve builds",
          error: error instanceof Error ? error.message : "Unknown error", // Handle error.message in case of a regular error object
        };

        // Explicitly set the Content-Type header to application/json
        res.setHeader("Content-Type", "application/json");
        res.status(500).json(errorMessage);
      }
    });

    // Create a new asset on the ledger.
    app.post("/createTestCase", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Validate required fields
      const requiredFields = [
        "id",
        "tcdesc",
        "dl",
        "pid",
        "tcn",
        "dtc",
        "usrn",
        "ostts",
        "tcSteps",
      ];

      for (let field of requiredFields) {
        if (!req.body[field]) {
          return res
            .status(400)
            .json({ error: `Missing required field: ${field}` });
        }
      }

      const { id, tcdesc, dl, pid, tcn, dtc, usrn, ostts, tcSteps } = req.body;

      console.log("Creating Test Case:");
      console.log(`Test Case ID: ${id}`);
      console.log(`Description: ${tcdesc}, DL: ${dl}, PID: ${pid}`);
      console.log(`Test Case Number: ${tcn}, Date Created: ${dtc}`);
      console.log(`Username: ${usrn}, Status: ${ostts}`);
      console.log(`Test Case Steps: ${tcSteps.length} steps`);

      try {
        // Call the function to create the test case
        await createAsset(
          contract,
          id,
          tcdesc,
          dl,
          pid,
          tcn,
          dtc,
          usrn,
          ostts,
          tcSteps
        );

        const successMessage = {
          status: "success",
          message: "*** Transaction createAsset committed successfully",
        };

        res.status(200).json(successMessage);
      } catch (error) {
        console.error("Error creating test case:", error);

        // Return a detailed error message
        if (error instanceof Error) {
          return res.status(500).json({ error: error.message });
        }

        // Return a generic error if the error type is unknown
        return res.status(500).json({
          error: "An unexpected error occurred while creating the test case.",
        });
      }
    });

    // Update a test case
    app.post("/updateTestCase", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if the required fields are present in the request body
      const requiredFields = [
        "id",
        "tcdesc",
        "dl",
        "pid",
        "tcn",
        "dtc",
        "usrn",
        "ostts",
      ];

      for (let field of requiredFields) {
        if (!req.body[field]) {
          return res
            .status(400)
            .json({ error: `Missing required field: ${field}` });
        }
      }

      const { id, tcdesc, dl, pid, tcn, dtc, usrn, ostts } = req.body;

      console.log("Update Test Case:");
      console.log(`Test Case ID: ${id}`);
      console.log(
        `Description: ${tcdesc}, DL: ${dl}, PID: ${pid}, Test Case Number: ${tcn}`
      );
      console.log(`Date Created: ${dtc}, Username: ${usrn}, Status: ${ostts}`);

      try {
        // Call the function to update the test case
        await UpdateAsset(contract, id, tcdesc, dl, pid, tcn, dtc, usrn, ostts);

        const successMessage = {
          status: "success",
          message: "Test case updated successfully",
        };

        res.status(200).json(successMessage);
      } catch (error) {
        console.error("Error updating test case:", error);

        // Handle known error type for clearer debugging
        if (error instanceof Error) {
          return res.status(500).json({ error: error.message });
        }

        // Handle any unknown error type
        return res
          .status(500)
          .json({ error: "Unknown error occurred while updating test case" });
      }
    });

    // Update overall status of a test case
    app.post("/updateTestCaseStatus", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if the required fields ('id' and 'ostts') are present
      if (!req.body.id || !req.body.ostts) {
        return res
          .status(400)
          .json({ error: "Missing required fields: id or ostts" });
      }

      const testCaseID = req.body.id;
      const newStatus = req.body.ostts;

      console.log("Update Test Case Status:");
      console.log(`Test Case ID: ${testCaseID}, New Status: ${newStatus}`);

      try {
        // Call the function to update the test case status
        const result = await UpdateTestCaseStatus(
          contract,
          testCaseID,
          newStatus
        );

        // If the update is successful, return a success message
        const successMessage = {
          status: "success",
          message: "Test case status updated successfully",
        };

        // Send back the success message
        res.status(200).json(successMessage);
      } catch (error: unknown) {
        console.error("Error updating test case status:", error);

        // Handle known error type for clearer debugging
        if (error instanceof Error) {
          return res.status(500).json({ error: error.message });
        }

        // Handle any unknown error type
        return res.status(500).json({
          error: "Unknown error occurred while updating test case status",
        });
      }
    });

    // Get test case by ID
    app.post("/readTestCaseByID", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if 'id' is present in the request body
      if (!req.body.id) {
        return res.status(400).json({ error: "Missing required field: id" });
      }

      const testCaseID = req.body.id;

      try {
        // Call the function to read the test case by ID
        const result = await readTestCaseByID(contract, testCaseID);

        // If no result found, handle it gracefully
        if (!result) {
          return res.status(404).json({
            error: `Test case with ID ${testCaseID} not found.`,
          });
        }

        // Return success response with the retrieved test case data
        res.status(200).json({
          status: "success",
          message: "Test case retrieved successfully",
          data: result, // Include the retrieved test case data in the response
        });
      } catch (error: unknown) {
        console.error("Error reading test case by ID:", error);

        // Handle known error type for clearer debugging
        if (error instanceof Error) {
          return res.status(500).json({ error: error.message });
        }

        // Handle any unknown error type
        return res
          .status(500)
          .json({ error: "Unknown error occurred while retrieving test case" });
      }
    });

    // Delete a test case
    app.delete("/deleteTestCase", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if the required 'id' field is present in the request body
      if (!req.body.id) {
        return res.status(400).json({ error: "Missing required field: id" });
      }

      try {
        // Call the deleteTestCase function to delete the test case
        await deleteTestCase(contract, req.body.id);

        // Return success message upon successful deletion
        const successMessage = {
          status: "success",
          message: "Test case deleted successfully",
        };
        res.status(200).json(successMessage); // Send response with a 200 OK status
      } catch (error: unknown) {
        console.error("Error deleting test case:", error);

        // Handle different types of errors gracefully
        if (error instanceof Error) {
          res.status(500).json({ error: error.message }); // Return specific error message
        } else {
          res.status(500).json({ error: "Unknown error occurred" }); // Generic error message for unknown errors
        }
      }
    });

    //create test plan
    app.post("/createTestPlan", async (req: any, res: any) => {
      console.log("Create Test Plan:");
      console.log(req.body);

      // Validate required fields in the request body
      if (
        !req.body.tpID ||
        !req.body.tpName ||
        !req.body.tpDesc ||
        !req.body.createdBy ||
        !req.body.dateCreated ||
        !req.body.assignedTestSuiteIDs ||
        !req.body.assignedBuildID
      ) {
        return res.status(400).json({
          error:
            "Missing required fields: tpID, tpName, tpDesc, createdBy, dateCreated, assignedTestSuiteIDs, assignedBuildID",
        });
      }

      try {
        // Call the createTestPlan function with the provided parameters
        await createTestPlan(
          contract,
          req.body.tpID,
          req.body.tpName,
          req.body.tpDesc,
          req.body.createdBy,
          req.body.dateCreated,
          req.body.isActive,
          req.body.isPublic,
          req.body.assignedTestSuiteIDs,
          req.body.assignedBuildID
        );

        const successMessage = {
          status: "success",
          message: "*** Transaction createTestPlan committed successfully",
        };

        // Return success message with 201 Created status
        res.status(201).json(successMessage);
      } catch (error: unknown) {
        console.error(`Failed to create test plan: ${error}`);

        // Return appropriate error response
        if (error instanceof Error) {
          res.status(500).json({ error: error.message }); // If error is an instance of Error, return the message
        } else {
          res.status(500).json({ error: "Unknown error occurred" }); // For other unexpected errors
        }
      }
    });

    //create test suite
    app.post("/createTestSuite", async (req: any, res: any) => {
      console.log("Create Test Suite:");
      console.log(req.body);

      // Validate if the required fields are provided in the request body
      if (!req.body.tsID || !req.body.tsName || !req.body.tsDesc) {
        return res.status(400).json({
          error: "Missing required fields: tsID, tsName, tsDesc",
        });
      }

      try {
        // Call the createTestSuite function with the provided parameters
        await createTestSuite(
          contract,
          req.body.tsID,
          req.body.tsName,
          req.body.tsDesc,
          req.body.cb,
          req.body.dc
        );

        const successMessage = {
          status: "success",
          message: "*** Transaction createTestSuite committed successfully",
        };

        // Return success message with 201 Created status
        res.status(201).json(successMessage);
      } catch (error: unknown) {
        console.error(`Failed to create test suite: ${error}`);

        // Return appropriate error response
        if (error instanceof Error) {
          res.status(500).json({ error: error.message }); // If error is an instance of Error, return the message
        } else {
          res.status(500).json({ error: "Unknown error occurred" }); // For other unexpected errors
        }
      }
    });

    //create build
    app.post("/createBuild", async (req: any, res: any) => {
      console.log("Create Build:");
      console.log(req.body);

      // Validate if the required fields are provided in the request body
      if (
        !req.body.bId ||
        !req.body.bTitle ||
        !req.body.bDesc ||
        !req.body.bReleaseDate
      ) {
        return res.status(400).json({
          error: "Missing required fields: bId, bTitle, bDesc, bReleaseDate",
        });
      }

      try {
        // Call the createBuild function with the provided parameters
        await createBuild(
          contract,
          req.body.bId,
          req.body.bTitle,
          req.body.bDesc,
          req.body.bActive,
          req.body.bOpen,
          req.body.bReleaseDate,
          req.body.bVersion
        );

        const successMessage = {
          status: "success",
          message: "*** Transaction createBuild committed successfully",
        };

        // Return success message
        res.status(201).json(successMessage); // 201 Created status as a successful creation
      } catch (error: unknown) {
        console.error(`Failed to create build: ${error}`);

        // Return a proper error message
        if (error instanceof Error) {
          res.status(500).json({ error: error.message }); // If error is an instance of Error, return the message
        } else {
          res.status(500).json({ error: "Unknown error occurred" }); // For other unexpected errors
        }
      }
    });

    app.get("/getLatestTestPlanID", async (req: any, res: any) => {
      try {
        // Call the GetLatestTestPlanID method in your chaincode
        const latestID = await GetLatestTestPlanID(contract); // Replace 'contract' with your actual contract object

        // Ensure the result is a string (it could be a Buffer, so we convert it to a string)
        const latestIDString = latestID.toString().trim(); // Use .trim() to remove any extra spaces or newline chars

        // Handle the case where there is no test plan ID or if the result is invalid
        if (!latestIDString || latestIDString === "No test plans found") {
          return res
            .status(404) // Not Found if no test plans are found
            .json({
              error: "No test plans found or ID could not be determined",
            });
        }

        // Return the latest test plan ID as a JSON response
        return res.status(200).json({ latestTestPlanID: latestIDString });
      } catch (error: unknown) {
        console.error("Error fetching latest test plan ID:", error);

        // Handle error based on the type of error
        if (error instanceof Error) {
          res.status(500).json({ error: error.message }); // Return error message from caught Error
        } else {
          res.status(500).json({ error: "Unknown error occurred" }); // Handle unexpected error types
        }
      }
    });

    //getLatestTestSuiteID
    app.get("/getLatestTestSuiteID", async (req: any, res: any) => {
      try {
        // Call the GetLatestTestSuiteID method in your chaincode
        const latestID = await GetLatestTestSuiteID(contract); // Replace 'contract' with your actual contract object

        // Ensure the result is a string (it could be a Buffer, so we convert it to a string)
        const latestIDString = latestID.toString().trim(); // Use .trim() to remove any extra spaces or newline chars

        // Handle the case where there is no test suite ID or if the result is invalid
        if (!latestIDString || latestIDString === "No test suites found") {
          return res
            .status(404) // Not Found if no test suite is found
            .json({
              error: "No test suites found or ID could not be determined",
            });
        }

        // Return the latest test suite ID as a JSON response
        return res.status(200).json({ latestTestSuiteID: latestIDString });
      } catch (error: unknown) {
        console.error("Error fetching latest test suite ID:", error);

        // Handle error based on the type of error
        if (error instanceof Error) {
          res.status(500).json({ error: error.message }); // Return error message from caught Error
        } else {
          res.status(500).json({ error: "Unknown error occurred" }); // Handle unexpected error types
        }
      }
    });

    //getLatestBuildID
    app.get("/getLatestBuildID", async (req: any, res: any) => {
      try {
        // Call the GetLatestBuildID method in your chaincode
        const latestID = await GetLatestBuildID(contract); // Replace 'contract' with your actual contract object

        // Ensure the result is a string (it could be a Buffer, so we convert it to a string)
        const latestIDString = latestID.toString().trim(); // Use .trim() to remove any extra spaces or newline chars

        // Handle the case where there is no build ID or if the result is invalid
        if (!latestIDString || latestIDString === "No builds found") {
          return res
            .status(404) // Not Found if no build is found
            .json({ error: "No builds found or ID could not be determined" });
        }

        // Return the latest build ID as a JSON response
        return res.status(200).json({ latestBuildID: latestIDString });
      } catch (error: unknown) {
        console.error("Error fetching latest build ID:", error);

        // Handle error based on the type of error
        if (error instanceof Error) {
          res.status(500).json({ error: error.message }); // Return error message from caught Error
        } else {
          res.status(500).json({ error: "Unknown error occurred" }); // Handle unexpected error types
        }
      }
    });

    //delete test plan
    app.delete("/deleteTestPlan", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if ID is present in the request body
      if (!req.body.tpID) {
        return res.status(400).json({ error: "Missing required field: tpID" });
      }

      try {
        // Attempt to delete the test plan using the provided tpID
        await deleteTestPlan(contract, req.body.tpID);

        // Send a success response upon successful deletion
        const successMessage = {
          status: "success",
          message: "Test Plan deleted successfully",
        };
        res.status(200).send(JSON.stringify(successMessage)); // Use 200 OK on successful deletion
      } catch (error: unknown) {
        console.error("Error deleting test plan:", error);

        // Handle specific errors
        if (error instanceof Error) {
          if (error.message.includes("does not exist")) {
            // If test plan does not exist, return 404 Not Found
            res.status(404).json({
              error: `Test Plan with ID ${req.body.tpID} does not exist.`,
            });
          } else {
            // For general errors, return 500 Internal Server Error
            res.status(500).json({ error: "Failed to delete test plan" });
          }
        } else {
          // If an unknown error occurs
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    //delete test suite
    app.delete("/deleteTestSuite", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if ID is present in the request body
      if (!req.body.tsID) {
        return res.status(400).json({ error: "Missing required field: tsID" });
      }

      try {
        // Attempt to delete the test suite using the provided tsID
        await deleteTestSuite(contract, req.body.tsID);

        // Send a success response upon successful deletion
        const successMessage = {
          status: "success",
          message: "Test Suite deleted successfully",
        };
        res.status(200).send(JSON.stringify(successMessage)); // Use 200 OK on successful deletion
      } catch (error: unknown) {
        console.error("Error deleting test suite:", error);

        // Handle specific errors
        if (error instanceof Error) {
          if (error.message.includes("does not exist")) {
            // If test suite does not exist, return 404 Not Found
            res.status(404).json({
              error: `Test Suite with ID ${req.body.tsID} does not exist.`,
            });
          } else {
            // For general errors, return 500 Internal Server Error
            res.status(500).json({ error: "Failed to delete test suite" });
          }
        } else {
          // If an unknown error occurs
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    //delete build
    app.delete("/deleteBuild", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if ID is present in the request body
      if (!req.body.bId) {
        return res.status(400).json({ error: "Missing required field: id" });
      }

      try {
        // Attempt to delete the build using the provided bId
        await deleteBuild(contract, req.body.bId);

        // Send a success response upon successful deletion
        const successMessage = {
          status: "success",
          message: "Build deleted successfully",
        };
        res.status(200).send(JSON.stringify(successMessage)); // Use 200 OK on successful deletion
      } catch (error: unknown) {
        console.error("Error deleting build:", error);

        // Handle specific errors
        if (error instanceof Error) {
          if (error.message.includes("does not exist")) {
            // If build does not exist, return 404 Not Found
            res
              .status(404)
              .json({ error: `Build with ID ${req.body.bId} does not exist.` });
          } else {
            // For general errors, return 500 Internal Server Error
            res.status(500).json({ error: "Failed to delete build" });
          }
        } else {
          // If an unknown error occurs
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    app.get("/getTestPlanById/:id", async (req: any, res: any) => {
      try {
        const testPlanID = req.params.id;

        // Check if testPlanID is present
        if (!testPlanID) {
          return res
            .status(400)
            .json({ error: "Missing required path parameter: id" });
        }

        // Fetch the test plan details using the provided testPlanID
        const testPlanDetails = await GetTestPlanById(contract, testPlanID);
        res.status(200).json(testPlanDetails); // Return the test plan details with 200 OK status
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error("Error fetching test plan:", error);

          // If the error message contains 'does not exist', return a 404 status
          if (error.message.includes("does not exist")) {
            res.status(404).json({
              error: `Test Plan with ID ${req.params.id} does not exist.`,
            });
          } else {
            res.status(500).json({ error: "Failed to retrieve test plan." });
          }
        } else {
          console.error("Unknown error fetching test plan");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    //getTestSuiteByID
    app.get("/getTestSuiteById/:id", async (req: any, res: any) => {
      try {
        const testSuiteID = req.params.id;

        // Check if testSuiteID is present
        if (!testSuiteID) {
          throw new HttpError("Missing required path parameter: id", 400);
        }

        // Fetch the test suite details using the provided testSuiteID
        const testSuiteDetails = await GetTestSuiteByID(contract, testSuiteID);
        res.status(200).json(testSuiteDetails); // Return the test suite details with 200 OK status
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to retrieve test suite: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          // If the error message contains 'does not exist', return a 404 status
          if (error.message.includes("does not exist")) {
            console.error(`Test Suite not found: ${error.message}`);
            res.status(404).json({
              error: `Test Suite with ID ${req.params.id} not found.`,
            });
          } else {
            console.error(`Error fetching test suite: ${error.message}`);
            res.status(500).json({ error: "Failed to retrieve test suite." });
          }
        } else {
          console.error("Unknown error fetching test suite");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    //getBuildByID
    app.get("/getBuildByID/:id", async (req: any, res: any) => {
      try {
        const buildID = req.params.id;

        // Check if buildID is present
        if (!buildID) {
          throw new HttpError("Missing required path parameter: id", 400);
        }

        // Fetch the build details using the provided buildID
        const buildDetails = await GetBuildByID(contract, buildID);
        res.status(200).json(buildDetails); // Return the build details with 200 OK status
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to retrieve build: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          // If the error message contains 'does not exist', return a 404 status
          if (error.message.includes("does not exist")) {
            console.error(`Build not found: ${error.message}`);
            res
              .status(404)
              .json({ error: `Build with ID ${req.params.id} not found.` });
          } else {
            console.error(`Error fetching build: ${error.message}`);
            res.status(500).json({ error: "Failed to retrieve build." });
          }
        } else {
          console.error("Unknown error fetching build");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    //update test plan
    app.post("/updateTestPlan", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if required fields (tpID) are present
      if (!req.body.tpID) {
        throw new HttpError("Missing required field: tpID", 400);
      }

      console.log("Update Test Plan:");
      console.log(req.body);

      try {
        // Call the function to update the test plan
        await UpdateTestPlan(
          contract,
          req.body.tpID,
          req.body.tpName,
          req.body.tpDesc,
          req.body.createdBy,
          req.body.dateCreated,
          req.body.updatedBy,
          req.body.dateUpdated,
          req.body.isActive,
          req.body.isPublic,
          req.body.assignedTestSuiteIDs,
          req.body.assignedBuildID
        );

        const successMessage = {
          status: "success",
          message: "Test plan updated successfully",
        };

        res.status(200).json(successMessage); // Send success message with 200 status code
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to update test plan: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Error updating test plan: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Unknown error updating test plan");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    //update test suite
    app.post("/updateTestSuite", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if required fields (tsID) are present
      if (!req.body.tsID) {
        throw new HttpError("Missing required field: tsID", 400);
      }

      console.log("Update Test Suite:");
      console.log(req.body);

      try {
        // Call the function to update the test suite
        await UpdateTestSuite(
          contract,
          req.body.tsID,
          req.body.tsName,
          req.body.tsDesc,
          req.body.tsStatus,
          req.body.imp,
          req.body.cb,
          req.body.dc
        );

        const successMessage = {
          status: "success",
          message: "Test suite updated successfully",
        };

        res.status(200).json(successMessage); // Send success message with 200 status code
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to update test suite: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Error updating test suite: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Unknown error updating test suite");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    //update build
    app.post("/updateBuild", async (req: any, res: any) => {
      console.log("Received request body:", req.body);

      // Check if required fields (bId) are present
      if (!req.body.bId) {
        throw new HttpError("Missing required field: bId", 400);
      }

      console.log("Update Build:");
      console.log(req.body);

      try {
        // Call the function to update the build
        await UpdateBuild(
          contract,
          req.body.bId,
          req.body.bTitle,
          req.body.bDesc,
          req.body.bActive,
          req.body.bOpen,
          req.body.bReleaseDate,
          req.body.bVersion
        );

        const successMessage = {
          status: "success",
          message: "Build updated successfully",
        };
        res.status(200).json(successMessage); // Send success message with 200 status code
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to update build: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Error updating build: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Unknown error updating build");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // returns the ID associated with the invoking identity.
    app.get("/getClientID", async (req: any, res: any) => {
      try {
        await getClientID(contract);

        const successMessage = {
          status: "success",
          message: "*** Transaction getClientID committed successfully",
        };

        res.status(200).json(successMessage); // Sending a success response with 200 status code
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to get client ID: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to get client ID: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to get client ID: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    app.get("/getTestPlansForTestSuite/:id", async (req: any, res: any) => {
      try {
        const testSuiteID = req.params.id;

        if (!testSuiteID) {
          throw new HttpError("Missing required path parameter: id", 400);
        }

        const testPlanNames = await GetTestPlansForTestSuite(
          contract,
          testSuiteID
        );

        res.status(200).json(testPlanNames);
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to get test plans: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          // Optional: handle specific known error messages for not found cases
          if (error.message.includes("does not exist")) {
            console.error(`Test suite not found: ${error.message}`);
            res.status(404).json({ error: error.message });
          } else {
            console.error(`Failed to get test plans: ${error.message}`);
            res.status(500).json({ error: error.message });
          }
        } else {
          console.error("Failed to get test plans: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // assign test case
    /*app.post('/assignTestCaseToTestPlan', async (req: any, res: any) => {
            console.log("Assign test case to test plan:")
            console.log(req.body);
            try {
                await assignTestCaseToTestPlan(contract, req.body.id, req.body.tpID);
                res.status(200).json({ status: 'success' });
            } catch (error) {
                console.error('Error assigning test case to test plan:', error);
                res.status(500).json({ error: error });
            }
        });*/

    /*********Role APIs Functions*********** */
    // CREATE ROLE
    app.post("/createRole", async (req: any, res: any) => {
      console.log("Create Role:");
      console.log(req.body);
      try {
        await createRole(
          contract,
          req.body.roleId,
          req.body.roleName,
          req.body.description,
          req.body.isActive
        );
        res.json({
          status: "success",
          message: "*** Transaction createRole committed successfully",
        });
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to create role: ${error.message}`);
          res
            .status(error.statusCode)
            .json({ status: error.statusCode, error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to create role: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to create role: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // GET ROLE BY ID
    app.get("/getRole/:id", async (req: any, res: any) => {
      const roleId = req.params.id;
      console.log(`Get Role: ${roleId}`);
      try {
        const result = await readRole(contract, roleId);

        if (!result) {
          throw new HttpError("Role not found", 404);
        }

        res.send(result);
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to get role: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to get role: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to get role: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // UPDATE ROLE
    app.put("/updateRole", async (req: any, res: any) => {
      console.log("Update Role:");
      console.log(req.body);
      try {
        await updateRole(
          contract,
          req.body.roleId,
          req.body.roleName,
          req.body.description,
          req.body.isActive
        );
        res.json({
          status: "success",
          message: "*** Transaction updateRole committed successfully",
        });
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to update role: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to update role: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to update role: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // DELETE ROLE
    app.delete("/deleteRole/:id", async (req: any, res: any) => {
      const roleId = req.params.id;
      console.log(`Delete Role: ${roleId}`);
      try {
        await deleteRole(contract, roleId);
        res.json({
          status: "success",
          message: `Role ${roleId} deleted successfully`,
        });
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to delete role: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to delete role: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to delete role: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // GET ALL ROLES
    app.get("/getAllRoles", async (req: any, res: any) => {
      try {
        const roles = await getAllRoles(contract);
        res.send(roles);
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to get all roles: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to get all roles: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to get all roles: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    /********* User APIs **********/

    // CREATE USER
    app.post("/createUser", async (req: any, res: any) => {
      console.log("Create User:");
      console.log(req.body);
      let contract = network.getContract("basic", "UserContract");

      try {
        await createUser(
          contract,
          req.body.userId,
          req.body.email,
          req.body.username,
          req.body.password,
          req.body.roleId
        );

        res.json({
          status: "success",
          message: "*** Transaction createUser committed successfully",
        });
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to create user: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to create user: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to create user: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // GET USER BY ID
    app.get("/getUser/:id", async (req: any, res: any) => {
      const userId = req.params.id;
      console.log(`Get User: ${userId}`);

      try {
        let contract = network.getContract("basic", "UserContract");
        const user = await readUser(contract, userId);

        if (!user) {
          throw new HttpError("User not found", 404);
        }

        res.json(user); // Send parsed JSON directly
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to get user: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to get user: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to get user: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // UPDATE USER
    app.put("/updateUser", async (req: any, res: any) => {
      console.log("Update User:");
      console.log(req.body);

      try {
        let contract = network.getContract("basic", "UserContract");

        await updateUser(
          contract,
          req.body.userId,
          req.body.email,
          req.body.username,
          req.body.password,
          req.body.roleId,
          req.body.resetToken
        );

        res.json({
          status: "success",
          message: "*** Transaction updateUser committed successfully",
        });
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to update user: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to update user: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to update user: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // DELETE USER
    app.delete("/deleteUser/:id", async (req: any, res: any) => {
      const userId = req.params.id;
      console.log(`Delete User: ${userId}`);

      try {
        let contract = network.getContract("basic", "UserContract");
        await deleteUser(contract, userId);

        res.json({
          status: "success",
          message: `User ${userId} deleted successfully`,
        });
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to delete user: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to delete user: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to delete user: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    // GET ALL USERS
    app.get("/getAllUsers", async (req: any, res: any) => {
      try {
        let contract = network.getContract("basic", "UserContract");
        const users = await getAllUsers(contract);
        res.send(users);
      } catch (error: unknown) {
        if (error instanceof HttpError) {
          console.error(`Failed to get all users: ${error.message}`);
          res.status(error.statusCode).json({ error: error.message });
        } else if (error instanceof Error) {
          console.error(`Failed to get all users: ${error.message}`);
          res.status(500).json({ error: error.message });
        } else {
          console.error("Failed to get all users: Unknown error");
          res.status(500).json({ error: "Unknown error occurred" });
        }
      }
    });

    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });

    // console.log(`Example app listening on port`)

    // Create a new asset on the ledger.
    // await initLedger(contract);

    // Create a new asset on the ledger.
    // await createAsset(contract);

    // Get all test cases on the ledger.
    // await getAllTestCases(contract);

    // await getAllTestCasesWithHistory(contract);

    // await getAllTestPlans(contract);

    // await getAllTestPlansWithHistory(contract);

    // await getAllTestSuites(contract);

    // await getAllBuildsWithHistory(contract);

    // await getAllBuilds(contract);

    //await GetTestPlanById(contract, testPlanID)

    // await GetLatestTestPlanID(contract);
    // await GetLatestTestSuiteID(contract);
    // await GetLatestBuildID(contract);
    // Update an existing asset asynchronously.
    // await transferAssetAsync(contract);

    // Get the asset details by assetID.
    // await readAssetByID(contract);

    // Update an asset which does not exist.
    // await updateNonExistentAsset(contract)
    // returns the ID associated with the invoking identity.

    // Role and User startup logs
    // await getAllRoles(contract);
    // await getAllUsers(contract);

    // await getClientID(contract);
  } finally {
    // gateway.close();
    // client.close();
  }
}

main().catch((error) => {
  console.error("******** FAILED to run the application:", error);
  process.exitCode = 1;
});

async function newGrpcConnection(): Promise<grpc.Client> {
  const tlsRootCert = await fs.readFile(tlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  return new grpc.Client(peerEndpoint, tlsCredentials, {
    "grpc.ssl_target_name_override": peerHostAlias,
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
  console.log(
    "\n--> Evaluate Transaction: GetAllTestCases, function returns all the current test cases on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction("GetAllAssets");

  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);
  console.log("*** Result:", result);
  return result;
}

async function getAllTestCasesWithHistory(contract: Contract): Promise<void> {
  console.log(
    "\n--> Evaluate Transaction: GetAllTestCasesWithHistory, function returns all the current test cases with their history on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction(
    "GetAllAssetsWithHistory"
  );

  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);

  // Filter assets that have the property `idtest_cases`
  const filteredAssets = result.filter(
    (asset: any) => asset.history[0]?.Value?.idtest_cases !== undefined
  );

  console.log("*** Result:", filteredAssets);
  return filteredAssets;
}

/**
 * Submit a transaction synchronously, blocking until it has been committed to the ledger.
 */
async function createAsset(
  contract: Contract,
  id: string,
  tcdesc: string,
  dl: string,
  pid: string,
  tcn: string,
  dtc: string,
  usrn: string,
  ostts: string,
  tcSteps: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: CreateAsset, creates new asset with ID, Project ID, etc arguments"
  );

  // Convert uid array to JSON string
  // const uidJson = JSON.stringify(uid);

  await contract.submitTransaction(
    "CreateAsset",
    id,
    tcdesc,
    dl,
    pid,
    tcn,
    dtc,
    usrn,
    ostts,
    JSON.stringify(tcSteps)
    //tpID,
    // uid
    // stts,
  );

  console.log("*** Transaction committed successfully");
}

//function get
async function getAllTestPlans(contract: Contract): Promise<void> {
  console.log(
    "\n--> Evaluate Transaction: GetAllTestPlans, function returns all the current test cases on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction("GetAllTestPlan");
  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);
  console.log("*** Result:", result);
  return result;
}

async function getAllTestPlansWithHistory(contract: Contract): Promise<void> {
  console.log(
    "\n--> Evaluate Transaction: GetAllTestPlansWithHistory, function returns all the current test plans with their history on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction(
    "GetAllAssetsWithHistory"
  );

  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);

  // Filter assets that have the property idtest_cases
  const filteredAssets = result.filter(
    (asset: any) => asset.history[0]?.Value?.testPlanID !== undefined
  );

  console.log("*** Result:", filteredAssets);
  return filteredAssets;
}

//function get
async function getAllBuilds(contract: Contract): Promise<void> {
  console.log(
    "\n--> Evaluate Transaction: GetAllBuilds, function returns all the current build on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction("GetAllBuild");
  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);
  console.log("*** Result:", result);
  return result;
}

async function getAllBuildsWithHistory(contract: Contract): Promise<void> {
  console.log(
    "\n--> Evaluate Transaction: GetAllBuildsWithHistory, function returns all the current builds with their history on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction(
    "GetAllAssetsWithHistory"
  );

  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);

  // Filter assets that have the property idtest_cases
  const filteredAssets = result.filter(
    (asset: any) => asset.history[0]?.Value?.buildID !== undefined
  );

  console.log("*** Result:", filteredAssets);
  return filteredAssets;
}

async function GetLatestTestPlanID(contract: Contract): Promise<string> {
  try {
    console.log(
      "\n--> Evaluate Transaction: GetLatestTestPlanID, fetching the latest test plan ID"
    );

    // Call the chaincode function to get the latest test plan ID
    const resultBytes = await contract.evaluateTransaction(
      "GetLatestTestPlanID"
    );

    // Decode the result (assuming it's a Buffer)
    const resultJson = utf8Decoder.decode(resultBytes).trim(); // Trim any extra spaces or newline chars

    // If the result is empty or invalid, handle accordingly
    if (!resultJson || resultJson === "No test plans found") {
      throw new Error(
        "No test plans found or unable to determine the latest ID"
      );
    }

    console.log("*** Latest Test Plan ID:", resultJson);

    // Return the latest test plan ID as a string
    return resultJson;
  } catch (error) {
    console.error("Error fetching latest test plan ID:", error);
    throw new Error(`Failed to fetch latest test plan ID: ${error}`);
  }
}

//getLatestTestSuiteID
async function GetLatestTestSuiteID(contract: Contract): Promise<string> {
  try {
    console.log(
      "\n--> Evaluate Transaction: GetLatestTestSuiteID, fetching the latest test suite ID"
    );

    // Call the chaincode function to get the latest test plan ID
    const resultBytes = await contract.evaluateTransaction(
      "GetLatestTestSuiteID"
    );

    // Decode the result (assuming it's a Buffer)
    const resultJson = utf8Decoder.decode(resultBytes).trim(); // Trim any extra spaces or newline chars

    // If the result is empty or invalid, handle accordingly
    if (!resultJson || resultJson === "No test plans found") {
      throw new Error(
        "No test suites found or unable to determine the latest ID"
      );
    }

    console.log("*** Latest Test Suite ID:", resultJson);

    // Return the latest test plan ID as a string
    return resultJson;
  } catch (error) {
    console.error("Error fetching latest test suite ID:", error);
    throw new Error(`Failed to fetch latest test suite ID: ${error}`);
  }
}

//getLatestTestSuiteID
async function GetLatestBuildID(contract: Contract): Promise<string> {
  try {
    console.log(
      "\n--> Evaluate Transaction: GetLatestBuildID, fetching the latest build ID"
    );

    // Call the chaincode function to get the latest test plan ID
    const resultBytes = await contract.evaluateTransaction("GetLatestBuildID");

    // Decode the result (assuming it's a Buffer)
    const resultJson = utf8Decoder.decode(resultBytes).trim(); // Trim any extra spaces or newline chars

    // If the result is empty or invalid, handle accordingly
    if (!resultJson || resultJson === "No build found") {
      throw new Error("No build found or unable to determine the latest ID");
    }

    console.log("*** Latest build ID:", resultJson);

    // Return the latest test plan ID as a string
    return resultJson;
  } catch (error) {
    console.error("Error fetching latest build ID:", error);
    throw new Error(`Failed to fetch latest build ID: ${error}`);
  }
}

async function GetTestPlanById(
  contract: Contract,
  testPlanID: string
): Promise<any> {
  console.log(
    "\n--> Evaluate Transaction: GetTestPlanById, fetching test plan details for ID: ${testPlanID}"
  );

  try {
    // Evaluate the transaction to query the test plan by ID
    const resultBytes = await contract.evaluateTransaction(
      "GetTestPlanById",
      testPlanID
    );

    // Decode the response and parse the JSON
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);

    console.log("* Result:", result);
    return result;
  } catch (error) {
    console.error("Error fetching Test Plan with ID ${testPlanID}:", error);
    throw new Error(
      `Failed to fetch Test Plan with ID ${testPlanID}. Error: ${error}`
    );
  }
}

async function GetBuildByID(contract: Contract, buildID: string): Promise<any> {
  console.log(
    "\n--> Evaluate Transaction: GetBuildByID, fetching build details for ID: ${buildID}"
  );

  try {
    // Evaluate the transaction to query the test plan by ID
    const resultBytes = await contract.evaluateTransaction(
      "GetBuildByID",
      buildID
    );

    // Decode the response and parse the JSON
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);

    console.log("* Result:", result);
    return result;
  } catch (error) {
    console.error("Error fetching Build with ID ${buildID}:", error);
    throw new Error(
      `Failed to fetch Build with ID ${buildID}. Error: ${error}`
    );
  }
}

//getAllTestSuites
async function getAllTestSuites(contract: Contract): Promise<void> {
  console.log(
    "\n--> Evaluate Transaction: GetAllTestSuites, function returns all the current test cases on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction("GetAllTestSuite");
  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);
  console.log("*** Result:", result);
  return result;
}

//getTestSuiteByID
async function GetTestSuiteByID(
  contract: Contract,
  testSuiteID: string
): Promise<any> {
  console.log(
    "\n--> Evaluate Transaction: GetTestSuiteByID, fetching test plan details for ID: ${testSuiteID}"
  );

  try {
    // Evaluate the transaction to query the test plan by ID
    const resultBytes = await contract.evaluateTransaction(
      "GetTestSuiteByID",
      testSuiteID
    );

    // Decode the response and parse the JSON
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);

    console.log("* Result:", result);
    return result;
  } catch (error) {
    console.error("Error fetching Test Suite with ID ${testSuiteID}:", error);
    throw new Error(
      `Failed to fetch Test Suite with ID ${testSuiteID}. Error: ${error}`
    );
  }
}

//function test plan
async function createTestPlan(
  contract: Contract,
  tpID: string,
  tpName: string,
  tpDesc: string,
  createdBy: string,
  dateCreated: string,
  isActive: string,
  isPublic: string,
  assignedTestSuiteIDs: string,
  assignedBuildID: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: CreateTestPlan, creates new asset with ID, Project ID, etc arguments"
  );

  // Convert uid array to JSON string
  // const uidJson = JSON.stringify(uid);

  await contract.submitTransaction(
    "CreateTestPlan",
    tpID,
    tpName,
    tpDesc,
    createdBy,
    dateCreated,
    isActive,
    isPublic,
    JSON.stringify(assignedTestSuiteIDs),
    assignedBuildID
  );

  console.log("*** Test Plan committed successfully");
}

//create test suite function
//function test plan
async function createTestSuite(
  contract: Contract,
  tsID: string,
  tsName: string,
  tsDesc: string,
  cb: string,
  dc: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: CreateTestSuite, creates new asset with ID, Project ID, etc arguments"
  );

  // Convert uid array to JSON string
  // const uidJson = JSON.stringify(uid);

  await contract.submitTransaction(
    "CreateTestSuite",
    tsID,
    tsName,
    tsDesc,
    cb,
    dc
  );

  console.log("*** Test Suite committed successfully");
}

//create build
async function createBuild(
  contract: Contract,
  bId: string,
  bTitle: string,
  bDesc: string,
  bActive: string,
  bOpen: string,
  bReleaseDate: string,
  bVersion: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: CreateBuild, creates new asset with ID, Project ID, etc arguments"
  );

  // Convert uid array to JSON string
  // const uidJson = JSON.stringify(uid);

  await contract.submitTransaction(
    "CreateBuild",
    bId,
    bTitle,
    bDesc,
    bActive,
    bOpen,
    bReleaseDate,
    bVersion
  );

  console.log("*** Build committed successfully");
}

// Update Test Case Function
async function UpdateAsset(
  contract: Contract,
  id: string,
  tcdesc: string,
  dl: string,
  pid: string,
  tcn: string,
  dtc: string,
  usrn: string,
  ostts: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: UpdateTestCase, updates an existing test case on the ledger"
  );

  // Convert uid array to JSON string (if applicable)
  // const uidJson = JSON.stringify(uid);

  await contract.submitTransaction(
    "UpdateAsset",
    id,
    tcdesc,
    dl,
    pid,
    tcn,
    dtc,
    usrn,
    ostts
    // uid
    // stts, // Include status if necessary
  );

  console.log("*** Transaction committed successfully (Test Case updated)");
}

// update test plan
async function UpdateTestPlan(
  contract: Contract,
  tpID: string,
  tpName: string,
  tpDesc: string,
  createdBy: string,
  dateCreated: string,
  updatedBy: string,
  dateUpdated: string,
  isActive: string,
  isPublic: string,
  assignedTestSuiteIDs: string,
  assignedBuildID: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: UpdateTestCase, updates an existing test case on the ledger"
  );

  // Convert uid array to JSON string (if applicable)
  // const uidJson = JSON.stringify(uid);

  await contract.submitTransaction(
    "UpdateTestPlan",
    tpID,
    tpName,
    tpDesc,
    createdBy,
    dateCreated,
    updatedBy,
    dateUpdated,
    isActive,
    isPublic,
    JSON.stringify(assignedTestSuiteIDs),
    assignedBuildID
  );

  console.log("*** Transaction committed successfully (Test Plan updated)");
}

//update test suite
async function UpdateTestSuite(
  contract: Contract,
  tsID: string,
  tsName: string,
  tsDesc: string,
  tsStatus: string,
  imp: string,
  cb: string,
  dc: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: UpdateTestSuite, updates an existing test suite on the ledger"
  );

  // Convert uid array to JSON string (if applicable)
  // const uidJson = JSON.stringify(uid);

  await contract.submitTransaction(
    "UpdateTestSuite",
    tsID,
    tsName,
    tsDesc,
    tsStatus, // Default status
    imp,
    cb,
    dc
  );

  console.log("*** Transaction committed successfully (Test Suite updated)");
}

// update build
async function UpdateBuild(
  contract: Contract,
  bId: string,
  bTitle: string,
  bDesc: string,
  bActive: string,
  bOpen: string,
  bReleaseDate: string,
  bVersion: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: UpdateBuild, updates an existing build on the ledger"
  );

  await contract.submitTransaction(
    "UpdateBuild",
    bId,
    bTitle,
    bDesc,
    bActive,
    bOpen,
    bReleaseDate,
    bVersion
  );

  console.log("*** Transaction committed successfully (Build updated)");
}

// update only overall status of the asset
async function UpdateTestCaseStatus(
  contract: Contract,
  id: string,
  ostts: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: UpdateTestCaseStatus, updates the overall status of a test case on the ledger"
  );
  //finish the code
  await contract.submitTransaction("UpdateStatus", id, ostts);

  console.log(
    "*** Transaction committed successfully (Overall Status updated)"
  );
}
/**
 * Submit transaction asynchronously, allowing the application to process the smart contract response (e.g. update a UI)
 * while waiting for the commit notification.
 */
async function transferAssetAsync(contract: Contract): Promise<void> {
  console.log(
    "\n--> Async Submit Transaction: TransferAsset, updates existing asset owner"
  );

  const commit = await contract.submitAsync("TransferAsset", {
    arguments: [assetId, "Saptha"],
  });
  const oldOwner = utf8Decoder.decode(commit.getResult());

  console.log(
    `*** Successfully submitted transaction to transfer ownership from ${oldOwner} to Saptha`
  );
  console.log("*** Waiting for transaction commit");

  const status = await commit.getStatus();
  if (!status.successful) {
    throw new Error(
      `Transaction ${status.transactionId} failed to commit with status code ${status.code} `
    );
  }

  console.log("*** Transaction committed successfully");
}

async function readTestCaseByID(contract: Contract, id: string): Promise<void> {
  console.log(
    "\n--> Evaluate Transaction: ReadAsset, function returns asset attributes"
  );

  const resultBytes = await contract.evaluateTransaction("ReadAsset", id);

  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);
  console.log("*** Result:", result);
  return result;
}

// returns the getID associated with the invoking identity.
async function getClientID(contract: Contract): Promise<string> {
  console.log(
    "\n--> Evaluate Transaction: GetClientID, function returns the ID associated with the invoking identity"
  );

  const resultBytes = await contract.evaluateTransaction("GetID");
  const clientID = utf8Decoder.decode(resultBytes);
  //   const clientID = JSON.parse(resultJson);
  console.log("*** Client ID:", clientID);
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
  console.log(
    "\n--> Submit Transaction: DeleteAsset, function deletes asset from the ledger"
  );

  // Submit transaction to delete the asset
  await contract.submitTransaction("DeleteAsset", id);

  console.log("*** Transaction committed successfully (Test Case deleted)");
}

// DELETE TEST PLAN
async function deleteTestPlan(contract: Contract, tpID: string): Promise<void> {
  console.log(
    "\n--> Submit Transaction: DeleteTestPlan, function deletes test plan from the ledger"
  );

  // Submit transaction to delete the asset
  await contract.submitTransaction("DeleteTestPlan", tpID);

  console.log("*** Transaction committed successfully (Test Plan deleted)");
}

//delete test suite
async function deleteTestSuite(
  contract: Contract,
  tsID: string
): Promise<void> {
  console.log(
    "\n--> Submit Transaction: DeleteTestSuite, function deletes test suite from the ledger"
  );

  // Submit transaction to delete the asset
  await contract.submitTransaction("DeleteTestSuite", tsID);

  console.log("*** Transaction committed successfully (Test Suite deleted)");
}

//delete test suite
async function deleteBuild(contract: Contract, bId: string): Promise<void> {
  console.log(
    "\n--> Submit Transaction: DeleteBuild, function deletes build from the ledger"
  );

  // Submit transaction to delete the asset
  await contract.submitTransaction("DeleteBuild", bId);

  console.log("*** Transaction committed successfully (Build deleted)");
}

/**
 * submitTransaction() will throw an error containing details of any error responses from the smart contract.
 */
async function updateNonExistentAsset(contract: Contract): Promise<void> {
  console.log(
    "\n--> Submit Transaction: UpdateAsset asset70, asset70 does not exist and should return an error"
  );

  try {
    await contract.submitTransaction(
      "UpdateAsset",
      "asset70",
      "blue",
      "5",
      "Tomoko",
      "300"
    );
    console.log("******** FAILED to return an error");
  } catch (error) {
    console.log("*** Successfully caught the error: \n", error);
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

// Function to interact with the chaincode (using the contract)
async function GetTestPlansForTestSuite(
  contract: Contract,
  tsID: string
): Promise<any> {
  console.log(
    `--> Calling chaincode GetTestPlansForTestSuite to fetch TestPlans for TestSuiteID: ${tsID}`
  );

  try {
    // Invoke the chaincode to fetch TestPlans for the TestSuite
    const resultBytes = await contract.evaluateTransaction(
      "GetTestPlansForTestSuite",
      tsID
    );

    // Decode the response and parse it into JSON
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);

    console.log("* Result:", result);
    return result;
  } catch (error) {
    console.error(`Error fetching Test Plans for TestSuiteID ${tsID}:`, error);
    throw new Error(
      `Failed to fetch Test Plans for TestSuiteID ${tsID}. Error: ${error}`
    );
  }
}

/************Role Module Helper Functions ****************/

async function createRole(
  contract: Contract,
  roleId: string,
  roleName: string,
  description: string,
  isActive: string
): Promise<void> {
  console.log("--> Submit Transaction: CreateRole");
  await contract.submitTransaction(
    "CreateRole",
    roleId,
    roleName,
    description,
    isActive
  );
  console.log("*** Role committed successfully");
}

async function readRole(contract: Contract, roleId: string): Promise<any> {
  console.log("--> Evaluate Transaction: ReadRole");
  const result = await contract.evaluateTransaction("ReadRole", roleId);
  const jsonString = Buffer.from(result).toString("utf8");
  console.log("Decoded JSON string:", jsonString);

  try {
    return JSON.parse(jsonString);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON: ${err.message}\nRaw output: ${result}`
    );
  }
}

async function updateRole(
  contract: Contract,
  roleId: string,
  roleName: string,
  description: string,
  isActive: string
): Promise<void> {
  console.log("--> Submit Transaction: UpdateRole");
  await contract.submitTransaction(
    "UpdateRole",
    roleId,
    roleName,
    description,
    isActive
  );
  console.log("*** Role updated successfully");
}

async function deleteRole(contract: Contract, roleId: string): Promise<void> {
  console.log("--> Submit Transaction: DeleteRole");
  await contract.submitTransaction("DeleteRole", roleId);
  console.log("*** Role deleted successfully");
}

// Get All Roles
async function getAllRoles(contract: Contract): Promise<any> {
  console.log(
    "\n--> Evaluate Transaction: GetAllRoles, function returns all roles on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction("GetAllRoles");
  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);
  console.log("*** Result:", result);
  return result;
}

/************User Module Helper Functions ****************/

async function createUser(
  contract: Contract,
  userId: string,
  email: string,
  username: string,
  password: string,
  roleId: string
): Promise<void> {
  console.log("--> Submit Transaction: CreateUser");
  await contract.submitTransaction(
    "CreateUser",
    userId,
    email,
    username,
    password,
    roleId
  );
  console.log("*** User created successfully");
}

async function readUser(contract: Contract, userId: string): Promise<any> {
  console.log("--> Evaluate Transaction: ReadUser");
  try {
    const result = await contract.evaluateTransaction("ReadUser", userId);
    const jsonString = Buffer.from(result).toString("utf8");
    console.log("Decoded JSON string:", jsonString);

    try {
      return JSON.parse(jsonString);
    } catch (err) {
      throw new Error(
        `Failed to parse JSON: ${err.message}\nRaw output: ${jsonString}`
      );
    }
  } catch (error) {
    throw new Error(`Chaincode error: ${error.message || error}`);
  }
}

async function updateUser(
  contract: Contract,
  userId: string,
  email: string,
  username: string,
  password: string,
  roleId: string,
  resetToken: string
): Promise<void> {
  console.log("--> Submit Transaction: UpdateUser");
  await contract.submitTransaction(
    "UpdateUser",
    userId,
    email,
    username,
    password,
    roleId,
    resetToken
  );
  console.log("*** User updated successfully");
}

async function deleteUser(contract: Contract, userId: string): Promise<void> {
  console.log("--> Submit Transaction: DeleteUser");
  await contract.submitTransaction("DeleteUser", userId);
  console.log("*** User deleted successfully");
}

// Get All Users
async function getAllUsers(contract: Contract): Promise<any> {
  console.log(
    "\n--> Evaluate Transaction: GetAllUsers, function returns all users on the ledger"
  );

  const resultBytes = await contract.evaluateTransaction("GetAllUsers");
  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);
  console.log("*** Result:", result);
  return result;
}
