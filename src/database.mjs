import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

let docClient = null;
let AMAZON_DYNAMODB_TABLE = null;

export const initializeClient = (event = {}) => {
  if (!process.env.AMAZON_REGION) {
    throw new Error("AMAZON_REGION is required");
  }

  if (!process.env.AMAZON_DYNAMODB_TABLE) {
    throw new Error("AMAZON_DYNAMODB_TABLE is required");
  }

  AMAZON_DYNAMODB_TABLE = process.env.AMAZON_DYNAMODB_TABLE;

  const config = {
    region: process.env.AMAZON_REGION,
  };

  // Only use credentials if provided in the event object (for testing)
  if (event.credentials) {
    config.credentials = {
      accessKeyId: event.credentials.accessKeyId,
      secretAccessKey: event.credentials.secretAccessKey,
    };
  }

  const client = new DynamoDBClient(config);
  docClient = DynamoDBDocumentClient.from(client);
};

export const updateInviteLinks = async (payload, event = {}) => {
  console.log("process.version:", process.version); // check aws lambda runtime
  try {
    initializeClient(event);

    const domain = payload?.domain || "";

    const groups = await getAllGroups();

    const publishableGroups = groups.filter((group) => group.Publishable === true && group.InviteCode);

    const categories = await getAllCategories();

    const categoryMap = categories.reduce((acc, category) => {
      acc[category.SK] = category.Name;
      return acc;
    }, {});

    const groupedGroups = groupByDomainAndCategory(publishableGroups);

    const updatePromises = [];

    for (const key in groupedGroups) {
      const [domainKey, categoryKey] = key.split("#");

      if ((domain && domainKey !== domain.toUpperCase()) || !domainKey) {
        continue;
      }

      const sortedGroups = groupedGroups[key]
        .sort((a, b) => (a.TotalMembers || 0) - (b.TotalMembers || 0))
        .slice(0, 10);

      const inviteCodes = sortedGroups.map((group) => `${group.SK}|${group.Name}|${group.InviteCode}`);

      const domainDisplayName = sortedGroups.length > 0 ? sortedGroups[0].Domain : formatName(domainKey);

      const SK = categoryKey ? `${domainKey}#${categoryKey}` : domainKey;
      const params = {
        PK: "WHATSAPP#INVITELINKS",
        SK,
        DomainName: domainDisplayName,
        InviteCodes: inviteCodes,
        Updated: new Date().toISOString(),
      };

      if (categoryKey && categoryMap[categoryKey]) {
        params.CategoryName = categoryMap[categoryKey];
      }

      updatePromises.push(putInviteLink(params));
    }

    await Promise.all(updatePromises);

    return true;
  } catch (error) {
    console.error("Error updating invite links:", error);
    return false;
  }
};

async function getAllGroups() {
  const command = new QueryCommand({
    TableName: AMAZON_DYNAMODB_TABLE,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": "WHATSAPP#GROUP",
    },
  });

  const response = await docClient.send(command);
  return response.Items || [];
}

async function getAllCategories() {
  const command = new QueryCommand({
    TableName: AMAZON_DYNAMODB_TABLE,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": "WHATSAPP#GROUPCATEGORY",
    },
  });

  const response = await docClient.send(command);
  return response.Items || [];
}

async function putInviteLink(item) {
  const command = new PutCommand({
    TableName: AMAZON_DYNAMODB_TABLE,
    Item: item,
  });

  return docClient.send(command);
}

function sanitizeKey(str) {
  return str.replace(/[^a-zA-Z0-9]/g, ""); // Remove all non-alphanumeric chars
}

function groupByDomainAndCategory(groups) {
  return groups.reduce((acc, group) => {
    const domain = group.Domain ? sanitizeKey(group.Domain.toUpperCase()) : "";
    const category = group.Category ? sanitizeKey(group.Category.toUpperCase()) : "";

    let key;
    if (domain && category) {
      key = `${domain}#${category}`;
    } else if (domain) {
      key = domain;
    } else {
      return acc;
    }

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(group);
    return acc;
  }, {});
}

function formatName(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
