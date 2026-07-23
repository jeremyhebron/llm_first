import OpenAI from "openai";
import { zodFunction } from "openai/helpers/zod.mjs";
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources";
import { Messages } from "openai/resources/chat/completions.mjs";
import z, { string } from "zod";

const toolRegistry = {
  get_cryptocurrency_prices: async (input: { cryptocurrencies: string[] }) => {
    const data = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${input.cryptocurrencies.join(",")}&vs_currencies=usd`,
    ).then((res) => res.json());
    console.log(data);
    return data as Record<
      string,
      {
        usd: number;
      }
    >;
  },
  product_query: async (input: { query: string }) => {
    const data = await fetch(
      `https://dummyjson.com/products/search?q=${input.query}`,
    ).then((res) => res.json());

    return data;
  },
};

const messages: ChatCompletionMessageParam[] = [];

async function startAgent(prompt: string, maxSteps: number) {
  const client = new OpenAI({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: "https://api.anthropic.com/v1",
  });

  messages.push({
    role: "user",
    content: prompt,
  });

  //creating the stream
  for (let i = 0; i < maxSteps; i++) {
    const stream = await client.chat.completions.create({
      model: "claude-opus-4-8",
      messages,
      stream: true,
      tools: [
        zodFunction({
          name: "get_cryptocurrency_prices",
          description: "Fetches the prices of cryptocurrencies",
          parameters: z.object({
            cryptocurrencies: z.array(
              z.enum([
                "bitcoin",
                "solana",
                "ethereum",
                "bananacoin",
                "banana",
                "fewfjewn",
              ]),
            ),
          }),
        }),
        zodFunction({
          name: "product_query",
          description: "Fetches product data based on query",
          parameters: z.object({
            query: z.enum(["iphone", "samsung", "android", "mascara"]),
          }),
        }),
      ],
    });

    //accumlating response from stream
    const toolCalls = new Map<number, ChatCompletionMessageFunctionToolCall>();
    let response = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      for (const toolCall of delta?.tool_calls ?? []) {
        const cachedToolCall = toolCalls.get(toolCall.index);

        if (!cachedToolCall) {
          toolCalls.set(toolCall.index, {
            id: toolCall.id ?? "",
            type: "function",
            function: {
              name: toolCall.function?.name ?? "",
              arguments: toolCall.function?.arguments ?? "",
            },
          });
        } else {
          cachedToolCall.function.arguments +=
            toolCall.function?.arguments ?? "";
        }
      }
      if (delta?.content) {
        process.stdout.write(delta.content);
        response += delta.content;
      }
    }

    if (toolCalls.size > 0) {
      messages.push({
        role: "assistant",
        tool_calls: toolCalls.values().toArray(),
      });

      //tool execution loop
      for (const toolCall of toolCalls.values()) {
        const tool =
          toolRegistry[toolCall.function.name as keyof typeof toolRegistry];

        const parsedArgs = JSON.parse(toolCall.function.arguments);

        process.stdout.write(
          `Calling Tool: ${toolCall.function.name}(${toolCall.function.arguments})\n`,
        );

        const result = await tool(parsedArgs);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      //exit condition
    } else if (response) {
      messages.push({
        role: "assistant",
        content: response,
      });
      return response;
    }
  }
}

// await startAgent("Whats the price of fewfjewn?", 10);

await startAgent("can i see what kind of acessories come with iphones?", 10);

console.log(messages);
