/**
 * school-mcp-server.ts
 *
 * A lightweight MCP (Model Context Protocol) server that exposes three tools:
 *
 *  1. generate_remarks    — wraps the AI remarks endpoint
 *  2. get_student_fees    — fetches fee dues for a student
 *  3. get_attendance      — fetches attendance summary for a student
 *
 * Start with: npx tsx src/mcp/school-mcp-server.ts
 *
 * Used by:
 *  - Playwright MCP tests (tests/e2e/ai/remarks-mcp.spec.ts)
 *  - Vitest unit tests   (tests/unit/mcp-server.test.ts)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Schemas (Zod — used for validation inside handlers)
// ─────────────────────────────────────────────────────────────────────────────

export const GenerateRemarksSchema = z.object({
  students: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        overall_percentage: z.number().nullable(),
        subjects: z.array(
          z.object({
            id: z.string().min(1),
            name: z.string().min(1),
            percentage: z.number().nullable(),
          })
        ),
      })
    )
    .min(1, "At least one student is required"),
});

export const GetStudentFeesSchema = z.object({
  studentId: z.string().min(1, "studentId is required"),
  schoolId: z.string().min(1, "schoolId is required"),
  academicYearId: z.string().optional(),
});

export const GetAttendanceSchema = z.object({
  studentId: z.string().min(1, "studentId is required"),
  schoolId: z.string().min(1, "schoolId is required"),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2020).max(2100).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definitions (exposed via ListToolsRequest)
// ─────────────────────────────────────────────────────────────────────────────

export const SCHOOL_MCP_TOOLS = [
  {
    name: "generate_remarks",
    description:
      "Generates AI-powered report card remarks for one or more students based on their marks and subject percentages.",
    inputSchema: {
      type: "object" as const,
      properties: {
        students: {
          type: "array",
          description: "Array of student objects with marks data",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique student ID" },
              name: { type: "string", description: "Student full name" },
              overall_percentage: {
                type: ["number", "null"],
                description: "Overall percentage (0-100) or null if not computed",
              },
              subjects: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    percentage: { type: ["number", "null"] },
                  },
                  required: ["id", "name", "percentage"],
                },
              },
            },
            required: ["id", "name", "overall_percentage", "subjects"],
          },
          minItems: 1,
        },
      },
      required: ["students"],
    },
  },
  {
    name: "get_student_fees",
    description:
      "Fetches the current fee dues and payment history for a specific student.",
    inputSchema: {
      type: "object" as const,
      properties: {
        studentId: { type: "string", description: "The student's database ID" },
        schoolId: { type: "string", description: "The school's database ID" },
        academicYearId: {
          type: "string",
          description: "Optional academic year filter",
        },
      },
      required: ["studentId", "schoolId"],
    },
  },
  {
    name: "get_attendance",
    description:
      "Fetches the attendance summary (present/absent/total days) for a specific student.",
    inputSchema: {
      type: "object" as const,
      properties: {
        studentId: { type: "string", description: "The student's database ID" },
        schoolId: { type: "string", description: "The school's database ID" },
        month: {
          type: "number",
          description: "Optional month filter (1-12)",
          minimum: 1,
          maximum: 12,
        },
        year: {
          type: "number",
          description: "Optional year filter (e.g., 2025)",
          minimum: 2020,
          maximum: 2100,
        },
      },
      required: ["studentId", "schoolId"],
    },
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tool Handlers
// ─────────────────────────────────────────────────────────────────────────────

type ToolResult =
  | { content: Array<{ type: "text"; text: string }>; isError?: false }
  | { content: Array<{ type: "text"; text: string }>; isError: true };

async function handleGenerateRemarks(args: unknown): Promise<ToolResult> {
  const parse = GenerateRemarksSchema.safeParse(args);
  if (!parse.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Invalid arguments: ${parse.error.issues.map((i) => i.message).join("; ")}`,
        },
      ],
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const authToken = process.env.MCP_AUTH_TOKEN ?? "";

  try {
    const response = await fetch(`${baseUrl}/api/ai/remarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ students: parse.data.students }),
      signal: AbortSignal.timeout(30_000), // 30s timeout
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        isError: true,
        content: [{ type: "text", text: `API error ${response.status}: ${errorBody}` }],
      };
    }

    const data = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: "text", text: `Network error: ${message}` }],
    };
  }
}

async function handleGetStudentFees(args: unknown): Promise<ToolResult> {
  const parse = GetStudentFeesSchema.safeParse(args);
  if (!parse.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Invalid arguments: ${parse.error.issues.map((i) => i.message).join("; ")}`,
        },
      ],
    };
  }

  const { studentId, schoolId, academicYearId } = parse.data;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const url = new URL(`${baseUrl}/api/students/${studentId}/fees`);
  url.searchParams.set("schoolId", schoolId);
  if (academicYearId) url.searchParams.set("academicYearId", academicYearId);

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `Fee API error ${response.status}` }],
      };
    }

    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
}

async function handleGetAttendance(args: unknown): Promise<ToolResult> {
  const parse = GetAttendanceSchema.safeParse(args);
  if (!parse.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Invalid arguments: ${parse.error.issues.map((i) => i.message).join("; ")}`,
        },
      ],
    };
  }

  const { studentId, schoolId, month, year } = parse.data;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const url = new URL(`${baseUrl}/api/attendance/student/${studentId}`);
  url.searchParams.set("schoolId", schoolId);
  if (month) url.searchParams.set("month", String(month));
  if (year) url.searchParams.set("year", String(year));

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `Attendance API error ${response.status}` }],
      };
    }

    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "school-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: SCHOOL_MCP_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "generate_remarks":
      return handleGenerateRemarks(args);
    case "get_student_fees":
      return handleGetStudentFees(args);
    case "get_attendance":
      return handleGetAttendance(args);
    default:
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown tool: "${name}". Available tools: generate_remarks, get_student_fees, get_attendance`,
          },
        ],
      };
  }
});

// Only start the transport when running directly (not when imported in tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  const transport = new StdioServerTransport();
  server.connect(transport).then(() => {
    console.error("[SchoolMCP] Server running on stdio");
  });
}

export { server, handleGenerateRemarks, handleGetStudentFees, handleGetAttendance };
