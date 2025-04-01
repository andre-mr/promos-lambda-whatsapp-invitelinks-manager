import { updateInviteLinks } from "./database.mjs";

export const handler = async (event) => {
  try {
    let providedApiKey = "";
    const expectedApiKey = process.env.API_KEY;

    if (event.apiKey) {
      providedApiKey = event.apiKey;
    } else {
      providedApiKey = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"];
    }

    if (!expectedApiKey) {
      console.warn("API_KEY environment variable is not set");
    }

    if (!providedApiKey || providedApiKey !== expectedApiKey) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Unauthorized: Invalid or missing API key",
        }),
      };
    }

    const payload = event.body ? JSON.parse(event.body) : {};
    const resultStatus = await updateInviteLinks(payload, event);

    let message;

    if (resultStatus) {
      message = "Groups and invite links updated successfully";
    } else {
      message = "Failed to update groups and invite links";
    }

    return {
      statusCode: resultStatus.$metadata?.statusCode || 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
      }),
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Error processing request",
      }),
    };
  }
};
