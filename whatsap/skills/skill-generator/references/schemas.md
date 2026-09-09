# MCP Server JSON Schemas Reference

This document provides the complete JSON schemas for MCP server manifests and their components.

## Table of Contents
- [Root Manifest Schema](#root-manifest-schema)
- [Tool Schema](#tool-schema)
- [Resource Schema](#resource-schema)
- [Prompt Schema](#prompt-schema)
- [Complete Example](#complete-example)

---

## Root Manifest Schema

The top-level manifest file that describes an MCP server.
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "version"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Server name (lowercase, hyphens allowed)",
      "pattern": "^[a-z0-9-]+$"
    },
    "version": {
      "type": "string",
      "description": "Semantic version (e.g., '1.0.0')",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "description": {
      "type": "string",
      "description": "Brief description of what the server does"
    },
    "tools": {
      "type": "array",
      "description": "Array of tool definitions",
      "items": {
        "$ref": "#/definitions/tool"
      }
    },
    "resources": {
      "type": "array",
      "description": "Array of resource definitions",
      "items": {
        "$ref": "#/definitions/resource"
      }
    },
    "prompts": {
      "type": "array",
      "description": "Array of prompt definitions",
      "items": {
        "$ref": "#/definitions/prompt"
      }
    }
  },
  "definitions": {
    "tool": {
      "type": "object",
      "required": ["name", "description", "inputSchema"],
      "properties": {
        "name": {
          "type": "string",
          "description": "Tool name (snake_case recommended)"
        },
        "description": {
          "type": "string",
          "description": "What the tool does and when to use it"
        },
        "inputSchema": {
          "type": "object",
          "description": "JSON Schema for tool parameters",
          "required": ["type", "properties"],
          "properties": {
            "type": {
              "const": "object"
            },
            "properties": {
              "type": "object",
              "additionalProperties": {
                "$ref": "#/definitions/parameter"
              }
            },
            "required": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "parameter": {
      "type": "object",
      "required": ["type", "description"],
      "properties": {
        "type": {
          "enum": ["string", "number", "integer", "boolean", "array", "object"]
        },
        "description": {
          "type": "string"
        },
        "enum": {
          "type": "array"
        },
        "default": {},
        "items": {
          "$ref": "#/definitions/parameter"
        },
        "properties": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/parameter"
          }
        }
      }
    },
    "resource": {
      "type": "object",
      "required": ["uri", "name"],
      "properties": {
        "uri": {
          "type": "string",
          "description": "Unique URI for the resource"
        },
        "name": {
          "type": "string",
          "description": "Human-readable name"
        },
        "description": {
          "type": "string",
          "description": "What this resource provides"
        },
        "mimeType": {
          "type": "string",
          "description": "MIME type (e.g., 'application/json', 'text/plain')"
        }
      }
    },
    "prompt": {
      "type": "object",
      "required": ["name", "description"],
      "properties": {
        "name": {
          "type": "string",
          "description": "Prompt name"
        },
        "description": {
          "type": "string",
          "description": "What the prompt helps with"
        },
        "arguments": {
          "type": "array",
          "description": "Optional prompt parameters",
          "items": {
            "type": "object",
            "required": ["name", "description"],
            "properties": {
              "name": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "required": {
                "type": "boolean"
              }
            }
          }
        }
      }
    }
  }
}
```

---

## Tool Schema

Complete schema for defining MCP tools with all supported parameter types.

### Basic Tool Structure
```json
{
  "name": "tool_name",
  "description": "Clear description of what this tool does",
  "inputSchema": {
    "type": "object",
    "properties": {
      // Parameter definitions go here
    },
    "required": ["param1", "param2"]
  }
}
```

### Parameter Types

#### String Parameter
```json
"param_name": {
  "type": "string",
  "description": "What this parameter is for"
}
```

With constraints:
```json
"email": {
  "type": "string",
  "description": "User email address",
  "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
}
```

With enum:
```json
"priority": {
  "type": "string",
  "description": "Task priority level",
  "enum": ["low", "medium", "high", "urgent"]
}
```

#### Number/Integer Parameter
```json
"age": {
  "type": "integer",
  "description": "User age in years",
  "minimum": 0,
  "maximum": 150
}
```
```json
"price": {
  "type": "number",
  "description": "Product price in USD",
  "minimum": 0,
  "multipleOf": 0.01
}
```

#### Boolean Parameter
```json
"is_active": {
  "type": "boolean",
  "description": "Whether the feature is enabled"
}
```

#### Array Parameter

Simple array:
```json
"tags": {
  "type": "array",
  "description": "List of tags",
  "items": {
    "type": "string"
  }
}
```

Array of objects:
```json
"items": {
  "type": "array",
  "description": "Order items",
  "items": {
    "type": "object",
    "properties": {
      "product_id": {
        "type": "string",
        "description": "Product identifier"
      },
      "quantity": {
        "type": "integer",
        "description": "Number of items"
      }
    },
    "required": ["product_id", "quantity"]
  }
}
```

#### Object Parameter
```json
"address": {
  "type": "object",
  "description": "Shipping address",
  "properties": {
    "street": {
      "type": "string",
      "description": "Street address"
    },
    "city": {
      "type": "string",
      "description": "City name"
    },
    "postal_code": {
      "type": "string",
      "description": "Postal/ZIP code"
    }
  },
  "required": ["street", "city"]
}
```

#### Optional Parameters

Parameters not listed in `required` array are optional:
```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Required name"
      },
      "nickname": {
        "type": "string",
        "description": "Optional nickname"
      }
    },
    "required": ["name"]
  }
}
```

With default values:
```json
"sort_order": {
  "type": "string",
  "description": "Sort direction",
  "enum": ["asc", "desc"],
  "default": "asc"
}
```

---

## Resource Schema

Resources provide read-only data access.

### Basic Resource
```json
{
  "uri": "resource://namespace/identifier",
  "name": "Resource Name",
  "description": "What data this resource provides",
  "mimeType": "application/json"
}
```

### Common MIME Types

- `application/json` - JSON data
- `text/plain` - Plain text
- `text/html` - HTML content
- `text/markdown` - Markdown
- `application/pdf` - PDF documents
- `image/png`, `image/jpeg` - Images

### Template Resources

Resources can use URI templates for dynamic access:
```json
{
  "uri": "resource://users/{user_id}/profile",
  "name": "User Profile",
  "description": "Get profile data for a specific user",
  "mimeType": "application/json"
}
```

---

## Prompt Schema

Prompts are reusable templates for common workflows.

### Basic Prompt
```json
{
  "name": "code_review",
  "description": "Review code for best practices and potential issues"
}
```

### Prompt with Arguments
```json
{
  "name": "debug_issue",
  "description": "Help debug a specific error or issue",
  "arguments": [
    {
      "name": "error_message",
      "description": "The error message or stack trace",
      "required": true
    },
    {
      "name": "context",
      "description": "Additional context about when the error occurs",
      "required": false
    }
  ]
}
```

---

## Complete Example

Here's a full manifest demonstrating all components:
```json
{
  "name": "task-manager",
  "version": "1.0.0",
  "description": "Manage tasks and projects",
  
  "tools": [
    {
      "name": "create_task",
      "description": "Create a new task",
      "inputSchema": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Task title"
          },
          "description": {
            "type": "string",
            "description": "Detailed description"
          },
          "priority": {
            "type": "string",
            "description": "Task priority",
            "enum": ["low", "medium", "high"],
            "default": "medium"
          },
          "due_date": {
            "type": "string",
            "description": "Due date in ISO 8601 format"
          },
          "tags": {
            "type": "array",
            "description": "Task tags",
            "items": {
              "type": "string"
            }
          },
          "assignee": {
            "type": "object",
            "description": "Person assigned to task",
            "properties": {
              "user_id": {
                "type": "string",
                "description": "User identifier"
              },
              "notify": {
                "type": "boolean",
                "description": "Send notification",
                "default": true
              }
            },
            "required": ["user_id"]
          }
        },
        "required": ["title"]
      }
    },
    {
      "name": "list_tasks",
      "description": "List tasks with optional filtering",
      "inputSchema": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "description": "Filter by status",
            "enum": ["todo", "in_progress", "done"]
          },
          "assigned_to": {
            "type": "string",
            "description": "Filter by assignee user ID"
          },
          "limit": {
            "type": "integer",
            "description": "Maximum tasks to return",
            "minimum": 1,
            "maximum": 100,
            "default": 20
          }
        },
        "required": []
      }
    }
  ],
  
  "resources": [
    {
      "uri": "resource://tasks/summary",
      "name": "Task Summary",
      "description": "Overview of all tasks and their statuses",
      "mimeType": "application/json"
    },
    {
      "uri": "resource://tasks/{task_id}",
      "name": "Task Details",
      "description": "Detailed information about a specific task",
      "mimeType": "application/json"
    }
  ],
  
  "prompts": [
    {
      "name": "daily_standup",
      "description": "Generate a daily standup report of tasks"
    },
    {
      "name": "task_breakdown",
      "description": "Break down a large task into subtasks",
      "arguments": [
        {
          "name": "task_description",
          "description": "Description of the task to break down",
          "required": true
        },
        {
          "name": "max_subtasks",
          "description": "Maximum number of subtasks to create",
          "required": false
        }
      ]
    }
  ]
}
```

---

## Validation Tips

### Common Mistakes to Avoid

1. **Missing required fields**: Always include `name`, `version` in manifest; `name`, `description`, `inputSchema` in tools
2. **Invalid version format**: Use semantic versioning (e.g., "1.0.0", not "1.0" or "v1.0.0")
3. **Wrong inputSchema type**: Must always be `"type": "object"` at the root level
4. **Inconsistent naming**: Use consistent naming conventions (snake_case for tools, lowercase-hyphenated for server name)
5. **Missing descriptions**: Every tool and parameter should have a clear description

### Schema Validation Checklist

- [ ] Server name is lowercase with hyphens only
- [ ] Version follows semver format (x.y.z)
- [ ] All tools have name, description, and inputSchema
- [ ] All inputSchemas have type="object" and properties
- [ ] Required parameters are listed in the "required" array
- [ ] All parameters have type and description
- [ ] Enum values match the parameter type
- [ ] Resource URIs are unique and follow a consistent pattern
- [ ] Prompt arguments specify whether they're required

---

## Advanced Patterns

### Conditional Parameters

You can document (but not enforce in JSON Schema) conditional logic in descriptions:
```json
"notification_method": {
  "type": "string",
  "description": "How to notify. If 'email', email_address is required. If 'sms', phone_number is required.",
  "enum": ["email", "sms", "push"]
}
```

### Nested Objects

For complex data structures:
```json
"project": {
  "type": "object",
  "description": "Project configuration",
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "created_by": { "type": "string" },
        "created_at": { "type": "string" }
      }
    },
    "settings": {
      "type": "object",
      "properties": {
        "visibility": {
          "type": "string",
          "enum": ["public", "private"]
        }
      }
    }
  }
}
```

### Union Types (via oneOf)

While not commonly used in MCP, you can specify alternatives:
```json
"identifier": {
  "oneOf": [
    {
      "type": "string",
      "description": "User email"
    },
    {
      "type": "integer",
      "description": "User ID"
    }
  ],
  "description": "User identifier (email or ID)"
}
```

---

## References

- [JSON Schema Specification](https://json-schema.org/)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [Semantic Versioning](https://semver.org/)