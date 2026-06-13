import { z } from 'zod';

export const applyVerificationSchema = z
  .object({
    requestedType: z.enum(['INDIVIDUAL_SELLER', 'BUSINESS_SELLER']),
    documentUrl: z.url('Document URL is required'),
    businessName: z.string().min(2).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.requestedType === 'BUSINESS_SELLER' && !data.businessName) {
      ctx.addIssue({
        code: 'custom',
        message: 'Business name is required for business seller verification',
        path: ['businessName'],
      });
    }
  });

export const reviewVerificationSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'RESUBMIT_REQUIRED']),
  rejectionReason: z.string().min(3).max(500).optional(),
});
