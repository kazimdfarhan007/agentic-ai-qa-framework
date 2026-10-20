/**
 * mcp-server.test.ts
 *
 * Unit tests for the School MCP Server.
 * Tests:
 *  1. Tool listing (schema validation)
 *  2. Correct tool selection
 *  3. Wrong-tool selection (unknown tool name)
 *  4. Payload / schema validation (missing required fields)
 *  5. Error handling (network failures, timeout simulation)
 *  6. Zod schema boundary tests
 *
 * Does NOT make real network calls — uses vi.stubGlobal to mock fetch.
 *
 * @smoke @regression
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SCHOOL_MCP_TOOLS,
  GenerateRemarksSchema,
  GetStudentFeesSchema,
  GetAttendanceSchema,
  handleGenerateRemarks,
  handleGetStudentFees,
  handleGetAttendance,
} from "@/mcp/school-mcp-server";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockFetchOk(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
  );
}

function mockFetchError(status: number, body: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({}),
      text: async () => body,
    })
  );
}

function mockFetchNetworkError(message = "Network error"): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(message)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tool Listing & Schema Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Server — Tool Listing @smoke", () => {
  it("exposes exactly 3 tools", () => {
    expect(SCHOOL_MCP_TOOLS).toHaveLength(3);
  });

  it("all tools have a name, description, and inputSchema", () => {
    for (const tool of (SCHOOL_MCP_TOOLS as unknown as Array<{ name: string; description: string; inputSchema: { type: string; required: string[]; properties: Record<string, unknown> } }>)) {
      expect(tool).toHaveProperty("name");
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);

      expect(tool).toHaveProperty("description");
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(10);

      expect(tool).toHaveProperty("inputSchema");
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema).toHaveProperty("required");
    }
  });

  it("tool names match expected values", () => {
    const names = (SCHOOL_MCP_TOOLS as unknown as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("generate_remarks");
    expect(names).toContain("get_student_fees");
    expect(names).toContain("get_attendance");
  });

  it("generate_remarks schema requires 'students' field", () => {
    const tool = (SCHOOL_MCP_TOOLS as unknown as Array<{ name: string; inputSchema: { required: string[]; properties: Record<string, unknown> } }>).find((t) => t.name === "generate_remarks")!;
    expect(tool.inputSchema.required).toContain("students");
    expect(tool.inputSchema.properties).toHaveProperty("students");
  });

  it("get_student_fees schema requires studentId and schoolId", () => {
    const tool = (SCHOOL_MCP_TOOLS as unknown as Array<{ name: string; inputSchema: { required: string[] } }>).find((t) => t.name === "get_student_fees")!;
    expect(tool.inputSchema.required).toContain("studentId");
    expect(tool.inputSchema.required).toContain("schoolId");
  });

  it("get_attendance schema requires studentId and schoolId", () => {
    const tool = (SCHOOL_MCP_TOOLS as unknown as Array<{ name: string; inputSchema: { required: string[] } }>).find((t) => t.name === "get_attendance")!;
    expect(tool.inputSchema.required).toContain("studentId");
    expect(tool.inputSchema.required).toContain("schoolId");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Zod Schema Validation — generate_remarks
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Server — generate_remarks Schema @regression", () => {
  it("accepts valid payload", () => {
    const payload = {
      students: [
        {
          id: "s1",
          name: "Ali",
          overall_percentage: 80,
          subjects: [{ id: "sub1", name: "Math", percentage: 80 }],
        },
      ],
    };
    expect(GenerateRemarksSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects empty students array", () => {
    const result = GenerateRemarksSchema.safeParse({ students: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("least one student");
  });

  it("rejects missing students field", () => {
    const result = GenerateRemarksSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects student with empty id", () => {
    const result = GenerateRemarksSchema.safeParse({
      students: [{ id: "", name: "Ali", overall_percentage: 80, subjects: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts null overall_percentage (missing marks)", () => {
    const result = GenerateRemarksSchema.safeParse({
      students: [{ id: "s1", name: "Ali", overall_percentage: null, subjects: [] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-string id", () => {
    const result = GenerateRemarksSchema.safeParse({
      students: [{ id: 123, name: "Ali", overall_percentage: 80, subjects: [] }],
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Zod Schema Validation — get_student_fees
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Server — get_student_fees Schema @regression", () => {
  it("accepts valid payload", () => {
    const result = GetStudentFeesSchema.safeParse({
      studentId: "stu_001",
      schoolId: "school_001",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional academicYearId", () => {
    const result = GetStudentFeesSchema.safeParse({
      studentId: "stu_001",
      schoolId: "school_001",
      academicYearId: "yr_001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing studentId", () => {
    const result = GetStudentFeesSchema.safeParse({ schoolId: "school_001" });
    expect(result.success).toBe(false);
  });

  it("rejects missing schoolId", () => {
    const result = GetStudentFeesSchema.safeParse({ studentId: "stu_001" });
    expect(result.success).toBe(false);
  });

  it("rejects empty studentId", () => {
    const result = GetStudentFeesSchema.safeParse({ studentId: "", schoolId: "school_001" });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Zod Schema Validation — get_attendance
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Server — get_attendance Schema @regression", () => {
  it("accepts valid payload without optional fields", () => {
    const result = GetAttendanceSchema.safeParse({ studentId: "s1", schoolId: "sch1" });
    expect(result.success).toBe(true);
  });

  it("accepts valid payload with month and year", () => {
    const result = GetAttendanceSchema.safeParse({ studentId: "s1", schoolId: "sch1", month: 6, year: 2025 });
    expect(result.success).toBe(true);
  });

  it("rejects month < 1", () => {
    const result = GetAttendanceSchema.safeParse({ studentId: "s1", schoolId: "sch1", month: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects month > 12", () => {
    const result = GetAttendanceSchema.safeParse({ studentId: "s1", schoolId: "sch1", month: 13 });
    expect(result.success).toBe(false);
  });

  it("rejects year < 2020", () => {
    const result = GetAttendanceSchema.safeParse({ studentId: "s1", schoolId: "sch1", year: 2019 });
    expect(result.success).toBe(false);
  });

  it("rejects year > 2100", () => {
    const result = GetAttendanceSchema.safeParse({ studentId: "s1", schoolId: "sch1", year: 2101 });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tool Handlers — Happy Path
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Server — Tool Handlers: Happy Path @smoke", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generate_remarks returns content on success", async () => {
    const mockRemarks = { remarks: { s1: { overall: "Excellent", subjects: { sub1: "Excellent" } } } };
    mockFetchOk(mockRemarks);

    const result = await handleGenerateRemarks({
      students: [{ id: "s1", name: "Ali", overall_percentage: 90, subjects: [{ id: "sub1", name: "Math", percentage: 90 }] }],
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("remarks");
  });

  it("get_student_fees returns fee data on success", async () => {
    mockFetchOk({ dues: 5000, paid: 3000, pending: 2000 });

    const result = await handleGetStudentFees({ studentId: "stu_1", schoolId: "sch_1" });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("dues");
  });

  it("get_attendance returns attendance data on success", async () => {
    mockFetchOk({ presentDays: 20, absentDays: 2, totalDays: 22 });

    const result = await handleGetAttendance({ studentId: "stu_1", schoolId: "sch_1", month: 6, year: 2025 });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("presentDays");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Tool Handlers — Error Handling
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Server — Tool Handlers: Error Handling @regression", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("generate_remarks returns isError=true on invalid args (missing students)", async () => {
    const result = await handleGenerateRemarks({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid arguments");
  });

  it("generate_remarks returns isError=true on API 500", async () => {
    mockFetchError(500, "Internal Server Error");

    const result = await handleGenerateRemarks({
      students: [{ id: "s1", name: "Ali", overall_percentage: 80, subjects: [] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("500");
  });

  it("generate_remarks returns isError=true on API 401 (unauthenticated)", async () => {
    mockFetchError(401, "Unauthorized");

    const result = await handleGenerateRemarks({
      students: [{ id: "s1", name: "Ali", overall_percentage: 80, subjects: [] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("401");
  });

  it("generate_remarks returns isError=true on network failure", async () => {
    mockFetchNetworkError("fetch failed");

    const result = await handleGenerateRemarks({
      students: [{ id: "s1", name: "Ali", overall_percentage: 80, subjects: [] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("fetch failed");
  });

  it("get_student_fees returns isError=true on missing studentId", async () => {
    const result = await handleGetStudentFees({ schoolId: "sch_1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid arguments");
  });

  it("get_student_fees returns isError=true on API 404", async () => {
    mockFetchError(404, "Student not found");

    const result = await handleGetStudentFees({ studentId: "nonexistent", schoolId: "sch_1" });
    expect(result.isError).toBe(true);
  });

  it("get_attendance returns isError=true on missing schoolId", async () => {
    const result = await handleGetAttendance({ studentId: "stu_1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid arguments");
  });

  it("get_attendance returns isError=true on network failure", async () => {
    mockFetchNetworkError("ECONNREFUSED");

    const result = await handleGetAttendance({ studentId: "s1", schoolId: "sch_1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ECONNREFUSED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Wrong Tool Selection
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Server — Wrong Tool Selection @regression", () => {
  it("calling unknown tool name is not in the tool list", () => {
    const toolNames = SCHOOL_MCP_TOOLS.map((t) => t.name);
    const unknownTool = "delete_all_students";
    expect(toolNames).not.toContain(unknownTool);
  });

  it("calling a fee tool with remarks arguments fails schema validation", async () => {
    // Fee tool called with remarks-style argument (wrong tool selection)
    const result = await handleGetStudentFees({
      students: [{ id: "s1", name: "Ali", overall_percentage: 80, subjects: [] }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid arguments");
  });

  it("calling attendance tool with fee arguments fails schema validation", async () => {
    const result = await handleGetAttendance({ studentId: "stu_1" }); // missing schoolId
    expect(result.isError).toBe(true);
  });

  it("calling remarks tool with attendance arguments fails schema validation", async () => {
    const result = await handleGenerateRemarks({ studentId: "stu_1", schoolId: "sch_1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid arguments");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Timeout Simulation
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Server — Timeout Simulation @regression", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("generate_remarks handles AbortError (timeout) gracefully", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const result = await handleGenerateRemarks({
      students: [{ id: "s1", name: "Ali", overall_percentage: 80, subjects: [] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("aborted");
  });

  it("get_student_fees handles AbortError gracefully", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const result = await handleGetStudentFees({ studentId: "s1", schoolId: "sch1" });
    expect(result.isError).toBe(true);
  });
});
