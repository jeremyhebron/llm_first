import OpenAI from "openai";
import { zodFunction } from "openai/helpers/zod";
import z from "zod";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from "openai/resources";

console.log(process.env.OPENAI_API_KEY);
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const messages: ChatCompletionMessageParam[] = [
  {
    role: "user",
    content: "Whats the latest news with the Dodgers?",
  },
];

const response = await client.chat.completions.create({
  model: "gpt-5.5",
  messages,
  tools: [
    zodFunction({
      name: "web_search",
      description: "Search the web for information",
      parameters: z.object({
        query: z.string().describe("The search query to use"),
      }),
    }),
  ],
});

const choice = response.choices[0];

const toolRegistry = {
  web_search(args: { query: string }) {
    return {
      results: "Dodgers win world series",
    };
  },
};

const toolCalls = choice?.message
  .tool_calls as ChatCompletionMessageFunctionToolCall[];

if (toolCalls && toolCalls.length > 0) {
  messages.push({
    role: "assistant",
    tool_calls: toolCalls,
  });
}

for (const toolCall of (choice?.message
  .tool_calls as ChatCompletionMessageFunctionToolCall[]) ?? []) {
  //@ts-ignore
  const tool = toolRegistry[toolCall.function.name];

  if (!tool) {
    throw new Error(`Tool not found ${toolCall.function.name}`);
  }

  const parsedArgs = JSON.parse(toolCall.function.arguments);
  console.log(`Calling Tool: ${toolCall.function.name}`, parsedArgs);
  const result = tool(parsedArgs);
  console.log(`Result:`, result);

  messages.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(result),
  });
}

const response2 = await client.chat.completions.create({
  model: "gpt-5.5",
  messages,
});

const choice2 = response2.choices[0];

messages.push({
  role: "assistant",
  content: choice2?.message.content ?? "",
});

console.log(messages);
