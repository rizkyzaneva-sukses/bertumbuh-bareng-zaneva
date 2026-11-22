import { z } from "zod";

export const BookBody = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi").max(200),
  author: z.string().trim().min(1, "Penulis wajib diisi").max(200),
  pages: z.union([z.number().int().min(1).max(10000), z.null()]).optional(),
  category: z.string().trim().max(100).default(""),
  synopsis: z.string().trim().max(2000).default(""),
  stock: z.number().int().min(1, "Stok minimal 1").max(99).default(1),
  /**
   * Sampul. Boleh URL http(s) atau path lokal hasil unggahan
   * (`/api/books/<id>/cover`). String kosong = pakai sampul generatif.
   */
  coverUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^(https?:\/\/|\/)/i.test(v), "URL sampul harus diawali http(s):// atau /")
    .optional(),
});
