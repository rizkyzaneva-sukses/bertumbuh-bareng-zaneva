import { describe, expect, it } from "vitest";
import { normalizePhone, displayPhone } from "@/lib/phone";
import { parseUserList } from "@/lib/csv";
import { makeReturnToken, verifyReturnToken } from "@/lib/tokens";

describe("normalizePhone", () => {
  for (const s of ["081220210193", "6281220210193", "+6281220210193", "+62 812-2021-0193", "81220210193", "0812 2021 0193", "620812 2021 0193"])
    it(`"${s}" -> 6281220210193`, () => expect(normalizePhone(s)).toBe("6281220210193"));
  for (const s of ["", "abc", "12345", "0211234567", "+1 555 123 4567"]) it(`menolak "${s}"`, () => expect(normalizePhone(s)).toBeNull());
  it("display", () => expect(displayPhone("6281220210193")).toBe("081220210193"));
});

describe("parseUserList", () => {
  it("tempel teks, header, urutan terbalik, dobel, dan baris rusak", () => {
    const r = parseUserList(
      ["Nama,No HP", "Sinta Dewi, 081234567890", "+62 857-1111-2222; Budi", '"Citra, S.",0899 1234 5678', "Sinta lagi, 6281234567890", "Tanpa nomor", "Orang, 123"].join("\n"),
    );
    expect(r.rows).toEqual([
      { name: "Sinta Dewi", phone: "6281234567890" },
      { name: "Budi", phone: "6285711112222" },
      { name: "Citra, S.", phone: "6289912345678" },
    ]);
    expect(r.errors.map((e) => e.reason)).toEqual(["Nomor dobel di daftar", "Harus ada nama dan nomor HP", "Nomor HP tidak valid"]);
  });
  it("tab dan CRLF", () => expect(parseUserList("Ani\t08123456789\r\nBudi\t08234567890\r\n").rows).toHaveLength(2));
});

describe("token pengembalian", () => {
  it("valid, kedaluwarsa, dan dimanipulasi", () => {
    const t = makeReturnToken("loan1", "nonceX", Date.now() + 10_000);
    expect(verifyReturnToken(t)).toMatchObject({ loanId: "loan1", nonce: "nonceX" });
    expect(verifyReturnToken(t, Date.now() + 60_000)).toBeNull();
    const [p, s] = t.split(".");
    expect(verifyReturnToken(`${Buffer.from("loan2.nonceX.99999999999999").toString("base64url")}.${s}`)).toBeNull();
    expect(verifyReturnToken(`${p}.AAAA`)).toBeNull();
    expect(verifyReturnToken("sampah")).toBeNull();
  });
});
