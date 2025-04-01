import { jest } from "@jest/globals";
import { handler } from "../src/index.mjs";
import dotenv from "dotenv";
dotenv.config();

jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
  };
});

jest.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({ UnprocessedItems: {} }),
      }),
    },
    BatchWriteCommand: jest.fn().mockImplementation((params) => params),
  };
});

const credentials = {
  accessKeyId: process.env.AMAZON_ACCESS_KEY_ID,
  secretAccessKey: process.env.AMAZON_SECRET_ACCESS_KEY,
};

const events = {
  basicRequest: {
    body: JSON.stringify({}),
    apiKey: process.env.API_KEY,
    credentials,
  },
  domainRequest: {
    body: JSON.stringify({
      domain: "dev",
    }),
    apiKey: process.env.API_KEY,
    credentials,
  },
  unauthorizedRequest: {
    body: JSON.stringify({}),
    apiKey: "wrong-key",
    credentials,
  },
};

describe("Lambda Handler Integration Tests", () => {
  beforeEach(() => {
    expect(process.env.AMAZON_ACCESS_KEY_ID).toBeDefined();
    expect(process.env.AMAZON_SECRET_ACCESS_KEY).toBeDefined();
    expect(process.env.AMAZON_REGION).toBeDefined();
    expect(process.env.AMAZON_DYNAMODB_TABLE).toBeDefined();
    expect(process.env.API_KEY).toBeDefined();
  });

  test("should successfully update invite links without domain filter", async () => {
    const response = await handler(events.basicRequest);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe("Groups and invite links updated successfully");
  }, 30000); // Increased timeout for real DB operation

  test("should successfully update invite links with domain filter", async () => {
    const response = await handler(events.domainRequest);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe("Groups and invite links updated successfully");
  }, 30000);

  test("should reject unauthorized requests", async () => {
    const response = await handler(events.unauthorizedRequest);
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.message).toBe("Unauthorized: Invalid or missing API key");
  });
});
