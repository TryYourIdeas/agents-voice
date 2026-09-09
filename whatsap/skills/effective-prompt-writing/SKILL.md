---
name: effective-prompt-writing
description: Craft clear, effective prompts for AI assistants and language models. Optimize prompts for clarity, context, and desired outputs. Use when writing prompts for AI interactions, task delegation, or when improving communication with language models.
license: Proprietary. LICENSE.txt has complete terms
metadata:
  author: agentskills
  version: "1.0"
allowed-tools: Read Write
---

# Effective Prompt Writing Skill

This skill helps you craft clear, effective prompts for AI assistants and language models. Good prompts are specific, provide necessary context, and guide the model toward the desired output.

## When to Use This Skill

Use this skill when:
- You need to write a prompt for an AI assistant
- Your current prompts aren't getting the desired results
- You need to optimize prompts for specific tasks (coding, writing, analysis, etc.)
- You're unsure how to structure a prompt effectively
- You need prompts for complex multi-step tasks

## Principles of Effective Prompts

### 1. Be Specific and Clear
Vague prompts lead to vague responses. Specify exactly what you want.

**Poor:** "Write something about coding."
**Good:** "Write a Python function that sorts an array of integers using the quicksort algorithm."

### 2. Provide Context
Give the AI background information relevant to the task.

**Include:**
- The goal or objective
- Target audience or use case
- Relevant constraints or requirements
- Any background information

### 3. Define the Format
Specify the desired output format clearly.

**Examples:**
- "Return a JSON object with keys..."
- "Provide a bulleted list with..."
- "Write in markdown format with headers..."

### 4. Use Examples (Few-Shot Prompting)
Show examples of the desired input-output pattern.

**Example:**
```
Input: "What is 2 + 2?"
Output: "4"

Input: "What is 3 + 3?"
Output: "6"

Input: "What is 5 + 7?"
Output:
```

### 5. Set the Persona/Role
Assign a role to the AI for more focused responses.

**Examples:**
- "Act as a senior software engineer..."
- "You are an expert data analyst..."
- "Pretend you're a beginner-friendly tutor..."

## Prompt Structure Template

```markdown
[Role/Persona]
[Task Description]
[Context/Background]
[Constraints/Rules]
[Output Format]
[Examples (optional)]
[Questions to Clarify (optional)]
```

## Common Prompt Patterns

### Task Decomposition
Break complex tasks into steps:

```
1. First, analyze the requirements
2. Next, outline the approach
3. Then, implement the solution
4. Finally, review and suggest improvements
```

### Chain of Thought
Encourage step-by-step reasoning:

```
Think through this problem step by step before giving the final answer.
```

### Constraint Setting
Define boundaries clearly:

```
- Keep responses under 200 words
- Use only Python 3.8+ features
- Include comments explaining key logic
```

## Examples

### Example 1: Content Generation
```
You are a professional blog writer specializing in technology. Write a 500-word article about the benefits of using version control systems. Include:
- Three main benefits
- Real-world examples
- A conclusion summarizing key points

Format: Markdown with headers, bullet points, and code examples where appropriate.
Audience: Software developers with beginner to intermediate experience.
```

### Example 2: Data Analysis
```
You are an expert data analyst. Analyze the following sales data and provide insights:

[DATA]

Please:
1. Identify trends
2. Spot anomalies
3. Suggest actionable recommendations
4. Present findings in a clear table format

Be specific and reference the actual data points in your analysis.
```

### Example 3: Code Generation
```
Write a TypeScript function that validates email addresses using regex.

Requirements:
- Return true for valid emails, false otherwise
- Support common email formats
- Include JSDoc comments
- Add unit tests with at least 5 test cases

Follow TypeScript best practices and include type definitions.
```

## Common Mistakes to Avoid

### 1. Being Too Vague
❌ "Help me with this."
✅ "Help me debug this Python error message: [error details]"

### 2. Providing Too Much Irrelevant Information
Only include context that's directly relevant to the task.

### 3. Assuming the AI Knows Your Intent
Be explicit about what you want, not just what you're thinking.

### 4. Forgetting Output Format
Always specify how you want the response formatted.

### 5. Not Iterating
If the first prompt doesn't work, refine it based on the response.

## Best Practices

1. **Start broad, then narrow down**: Begin with a general request, then add constraints
2. **Iterate**: Use follow-up prompts to refine results
3. **Provide examples**: Show, don't just tell
4. **Be explicit about format**: Specify structure, length, style
5. **Set boundaries**: Define what's in scope and out of scope
6. **Ask clarifying questions**: If needed, have the AI ask you questions
7. **Test and refine**: Evaluate outputs and adjust prompts accordingly

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Responses are too generic | Add more specific constraints and examples |
| AI ignores instructions | Use clear, numbered steps and emphasize key requirements |
| Output format is wrong | Be very explicit about the desired format |
| AI is too verbose | Set word limits or request conciseness |
| AI doesn't understand context | Provide more background information |

## Quick Checklist

Before sending a prompt, check:
- [ ] Is the task clearly defined?
- [ ] Is there enough context?
- [ ] Are constraints and rules specified?
- [ ] Is the output format defined?
- [ ] Are examples included (if helpful)?
- [ ] Is a role/persona assigned (if relevant)?
- [ ] Are there any formatting or style requirements?

---

For more advanced prompt engineering techniques, explore specialized references or community resources. This skill provides a foundation for crafting effective prompts across various use cases.