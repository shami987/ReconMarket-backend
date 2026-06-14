import { randomUUID } from 'crypto';
import { UploadApiResponse } from 'cloudinary';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { cloudinary } from '../lib/cloudinary';
import { UploadedImage } from '../lib/upload';

const uploadBuffer = (buffer: Buffer): Promise<UploadApiResponse> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: env.CLOUDINARY_FOLDER,
        resource_type: 'image',
        public_id: randomUUID(),
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new AppError(500, 'Cloudinary upload failed'));
          return;
        }

        resolve(result);
      },
    );

    stream.end(buffer);
  });

const toUploadedImage = (
  result: UploadApiResponse,
  file: Express.Multer.File,
): UploadedImage => ({
  url: result.secure_url,
  filename: result.public_id,
  originalName: file.originalname,
  mimeType: file.mimetype,
  size: file.size,
});

export const uploadListingImagesToCloudinary = async (
  files: Express.Multer.File[],
): Promise<UploadedImage[]> => {
  try {
    const results = await Promise.all(
      files.map(async (file) => {
        if (!file.buffer) {
          throw new AppError(500, 'Uploaded file buffer is missing');
        }

        const result = await uploadBuffer(file.buffer);
        return toUploadedImage(result, file);
      }),
    );

    return results;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(502, 'Failed to upload images to Cloudinary');
  }
};
