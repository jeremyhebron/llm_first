import OpenAI from "openai";
import { zodFunction } from "openai/helpers/zod.mjs";
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources";
import { Messages } from "openai/resources/chat/completions.mjs";
import z from "zod";

// const client = new OpenAI();

// const stream = await client.chat.completions.create({
//   model: "gpt-5.5",
//   messages: [
//     {
//       role: "user",
//       content: "Whats the weather in San Diego right now?",
//     },
//   ],
//   stream: true,
//   tools: [
//     zodFunction({
//       name: "get_weather",
//       description: "Fetches the weater given a location",
//       parameters: z.object({
//         city: z.string(),
//         state: z.string(),
//       }),
//     }),
//   ],
// });

// let response = "";

// const toolCalls = new Map<number, ChatCompletionMessageFunctionToolCall>();

// for await (const chunk of stream) {
//   const choice = chunk.choices[0];

//   const delta = choice?.delta;

//   for (const toolCall of delta?.tool_calls ?? []) {
//     const cachedToolCall = toolCalls.get(toolCall.index);

//     if (!cachedToolCall) {
//       toolCalls.set(toolCall.index, {
//         id: toolCall.id ?? "",
//         type: "function",
//         function: {
//           name: toolCall.function?.name ?? "",
//           arguments: toolCall.function?.arguments ?? "",
//         },
//       });
//     } else {
//       cachedToolCall.function.arguments += toolCall.function?.arguments ?? "";
//     }
//   }

//   if (delta?.content) {
//     response += delta.content;
//   }
// }

// if (toolCalls.size > 0) {
//   // execute the tools
// } else if (response) {
// }

// console.log(response, toolCalls);

const toolRegistry = {
  get_cryptocurrency_prices: async (input: { cryptocurrencies: string[] }) => {
    const data = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${input.cryptocurrencies.join(",")}&vs_currencies=usd`,
    ).then((res) => res.json());

    return data as Record<
      string,
      {
        usd: number;
      }
    >;
  },
};

const messages: ChatCompletionMessageParam[] = [];

async function startAgent(prompt: string, maxSteps: number) {
  const client = new OpenAI();

  messages.push({
    role: "user",
    content: prompt,
  });

  //agent loop
  for (let i = 0; i < maxSteps; i++) {
    const stream = await client.chat.completions.create({
      model: "gpt-5.5",
      messages,
      stream: true,
      tools: [
        zodFunction({
          name: "get_cryptocurrency_prices",
          description: "Fetches the prices of cryptocurrencies",
          parameters: z.object({
            cryptocurrencies: z
              .array(z.string())
              .describe(
                "a list of cryptocurrency names e.g. bitcoin, etheruem, solana, etc.",
              ),
          }),
        }),
      ],
    });

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
      //execute tools
      messages.push({
        role: "assistant",
        tool_calls: toolCalls.values().toArray(),
      });
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
    } else if (response) {
      messages.push({
        role: "assistant",
        content: response,
      });
      return response;
    }
  }
}

// toolRegistry.get_cryptocurrency_prices({
//   cryptocrruencies: ["bitcoin", "solana", "ethereum"],
// });

await startAgent("Whats the price of bitcoin?", 10);

console.log(messages);
