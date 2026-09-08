import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { v2 as Cloudinary } from 'cloudinary';
import 'multer';

export interface UploadResult {
  publicId: string;
  fileUrl: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}
@Injectable()
export class UploadsService {
  private configured = false;
  private configure() {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    )
      throw new ServiceUnavailableException('Cloudinary is not configured');
    if (!this.configured) {
      Cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      this.configured = true;
    }
  }
  async uploadItemPhoto(
    file: Express.Multer.File,
    itemCode: string,
  ): Promise<UploadResult> {
    this.configure();
    const result = await this.upload(file.buffer, `items/${itemCode}`);
    return {
      publicId: result.public_id,
      fileUrl: result.secure_url,
      thumbnailUrl: Cloudinary.url(result.public_id, {
        width: 300,
        height: 300,
        crop: 'fill',
        secure: true,
      }),
      fileName: file.originalname,
      fileSize: result.bytes,
      mimeType: file.mimetype,
    };
  }
  async uploadPdf(buffer: Buffer, filename: string): Promise<UploadResult> {
    this.configure();
    const result = await this.upload(
      buffer,
      'pdfs',
      'raw',
      filename.replace(/\.pdf$/i, ''),
    );
    return { publicId: result.public_id, fileUrl: result.secure_url };
  }
  async deleteFile(
    publicId: string,
    resourceType: 'image' | 'raw' = 'image',
  ): Promise<void> {
    this.configure();
    await Cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  }
  private upload(
    buffer: Buffer,
    folder: string,
    resourceType: 'image' | 'raw' = 'image',
    publicId?: string,
  ): Promise<{ public_id: string; secure_url: string; bytes: number }> {
    return new Promise((resolve, reject) => {
      const stream = Cloudinary.uploader.upload_stream(
        {
          folder: `${process.env.CLOUDINARY_FOLDER ?? 'living-in-interiors'}/${folder}`,
          resource_type: resourceType,
          public_id: publicId,
          overwrite: Boolean(publicId),
          transformation:
            resourceType === 'image'
              ? [{ quality: 'auto', fetch_format: 'auto' }]
              : undefined,
        },
        (error, result) => {
          if (error) {
            const reason: Error =
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'string' ? error : 'Upload failed',
                  );
            reject(reason);
          } else {
            resolve(
              result as {
                public_id: string;
                secure_url: string;
                bytes: number;
              },
            );
          }
        },
      );
      stream.end(buffer);
    });
  }
}
