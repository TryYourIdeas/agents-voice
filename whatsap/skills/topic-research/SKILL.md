---
name: topic-research
description: Researches topics provided by users and creates comprehensive reports summarizing findings. Use when a user requests research on a specific topic, needs information gathered from multiple sources, or wants a structured report on a subject.
allowed-tools: 
  - read-file : For reading a file from a given path
  - write-file: For writing a file to a given path
  - list-directory: For listing the files in a given path
  - web-search: for searching the web for a given query
---

# Topic Research Skill

This skill enables thorough research on topics specified by users and generates well-structured reports summarizing the findings. The skill leverages web search capabilities to gather current and relevant information from online sources.

## When to Use This Skill

Use this skill when:
- A user explicitly asks for research on a specific topic
- A user needs information gathered and synthesized from multiple sources
- A user requests a report, summary, or analysis of a particular subject
- The user provides a file containing a research topic or question
- The topic requires up-to-date information that may not be in your training data

## How to Use This Skill

1. **Identify the research topic**: Extract the topic from the user's request or from a provided file
2. **Formulate search queries**: Break down complex topics into specific search queries
3. **Gather relevant information**: Use the web search tool to collect current information from reliable sources
4. **Organize findings**: Structure the information logically with appropriate sections
5. **Create a comprehensive report**: Generate a well-formatted document that summarizes all research findings
6. **Cite sources**: Include references to the sources used in your research

## Web Search Tool Usage

The topic research skill has access to a web search tool that can retrieve current information from the internet. When using this tool:

- Formulate clear, specific search queries to get the most relevant results
- Use multiple targeted searches for complex topics rather than one broad search
- Consider using different topic categories ("general", "news", or "finance") based on your research needs
- Adjust the `maxResults` parameter (default is 5) based on how much information you need
- For detailed content analysis, set `includeRawContent` to true

Example usage:
```
web_search({
  query: "recent advancements in AI healthcare diagnostics 2024",
  maxResults: 7,
  topic: "general",
  includeRawContent: false
})
```

## Report Structure

Reports should follow this general structure:

### Title
Clear, descriptive title reflecting the research topic

### Executive Summary
Brief overview (2-4 sentences) highlighting the most important findings

### Introduction
- Context and background of the topic
- Purpose of the research
- Scope of the investigation

### Main Findings
- Organized by subtopics or themes
- Supported by relevant facts and data from web search results
- Include different perspectives when applicable
- Cite sources appropriately

### Conclusion
- Summary of key insights
- Implications or significance of the findings

### References
- List all sources used in the research with proper attribution
- Include URLs and publication dates when available

## Examples

### Example Input
User provides a file named "research_topic.txt" containing:
```
Please research the impact of artificial intelligence on healthcare diagnostics.
```

### Example Process
1. Read the file to extract the research topic
2. Formulate search queries such as:
   - "AI in healthcare diagnostics benefits challenges"
   - "recent AI diagnostic tools medical applications"
   - "accuracy of AI diagnostic systems compared to doctors"
3. Use the web search tool with these queries to gather current information
4. Synthesize findings into a comprehensive report

### Example Output
A comprehensive report titled "The Impact of Artificial Intelligence on Healthcare Diagnostics" with sections covering current applications, benefits, challenges, case studies, regulatory considerations, and future outlook, with properly cited sources from the web search results.

## Best Practices

- Focus on accuracy and reliability of information from web search results
- Evaluate source credibility before including information in your report
- Present balanced perspectives when multiple viewpoints exist
- Use clear, accessible language appropriate for the expected audience
- Organize information logically with appropriate headings and subheadings
- Highlight the most significant findings prominently
- Acknowledge limitations or gaps in available information when relevant
- Update search queries if initial results don't provide sufficient information
- Combine information from multiple search results to create a comprehensive view

## File Handling

When the user provides a file containing the research topic:
1. Read the file to extract the exact research request
2. Use the extracted topic as the basis for formulating search queries
3. Ensure the final report addresses all aspects mentioned in the original request
4. Save research results in the research directory for reference