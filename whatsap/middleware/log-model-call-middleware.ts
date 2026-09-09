import { createMiddleware } from "langchain";

// 1. Define the logging middleware

export const logModelCallMiddleware = createMiddleware({
  name: "LoggingMiddleware",
  beforeModel: (state) => {
    // Log details before the model call
    console.log(`[Middleware] About to call model with ${state.messages.length} messages`);
    // Optional: Log the messages themselves
    // console.log(state.messages); 
    return; // No return value needed to proceed
  },
  afterModel: (state) => {
    // Log details after the model returns a response
    const lastMessage = state.messages[state.messages.length - 1];
    console.log(`[Middleware] Model returned: ${lastMessage.content}`);
    return; // No return value needed to proceed
  },
});