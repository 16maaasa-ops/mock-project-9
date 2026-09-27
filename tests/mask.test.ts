import { describe, expect, it } from "vitest";
import { maskEmail } from "@/lib/customers/mask";

describe("maskEmail", () => {
  it("先頭2文字だけ残してマスクする", () => {
    expect(maskEmail("customer001@example.com")).toBe(
      "cu*********@example.com",
    );
  });

  it("短いローカル部でも最低3文字はマスクする", () => {
    expect(maskEmail("ab@example.com")).toBe("ab***@example.com");
  });

  it("@が無い・先頭にある不正な値は *** にする", () => {
    expect(maskEmail("invalid")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
  });
});
