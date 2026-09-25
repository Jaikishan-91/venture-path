import { describe, expect, it } from "vitest";
import { displayFileName, resumeExtension, resumeFileError } from "@/lib/resumes";

describe("resumeFileError", () => {
  const file = { name: "cv.pdf", size: 100, type: "application/pdf" };

  it("accepts pdf, doc and docx", () => {
    expect(resumeFileError(file)).toBeNull();
    expect(
      resumeFileError({ ...file, name: "cv.docx", type: "application/octet-stream" }),
    ).toBeNull();
    expect(resumeExtension("a.DOC")).toBe("doc");
  });

  it.each([
    ["empty", { size: 0 }, "Choose a resume"],
    ["too big", { size: 5 * 1024 * 1024 + 1 }, "5 MB"],
    ["wrong extension", { name: "cv.exe" }, "PDF, DOC or DOCX"],
    ["wrong type", { type: "text/html" }, "PDF, DOC or DOCX"],
  ])("rejects %s", (_name, override, message) => {
    expect(resumeFileError({ ...file, ...override })).toContain(message);
  });

  it("strips a path from the display name", () => {
    expect(displayFileName("..\\..\\secret.pdf")).toBe("secret.pdf");
  });
});
