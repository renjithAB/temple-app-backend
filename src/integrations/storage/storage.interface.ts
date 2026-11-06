export interface UploadResult {
  url: string;
  publicId: string;
}

export interface IStorageService {
  uploadImage(
    fileBuffer: Buffer,
    folder: string,
    filename?: string
  ): Promise<UploadResult>;
  deleteImage(publicId: string): Promise<void>;
}
