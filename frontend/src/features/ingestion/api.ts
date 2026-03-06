import { axiosClient } from '../../lib/axiosClient';
import { IngestionResponse } from '../../types/api';

export async function uploadCsv(file: File, equipmentName?: string): Promise<IngestionResponse> {
  const form = new FormData();
  form.append('file', file);

  if (equipmentName && equipmentName.trim()) {
    form.append('equipmentName', equipmentName.trim());
  }

  const { data } = await axiosClient.post<IngestionResponse>('/ingestion/csv', form, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return data;
}
