import { FormEvent, useState } from 'react';

interface Props {
  onUpload: (file: File, equipmentName?: string) => Promise<void>;
  isLoading: boolean;
  lastResult?: {
    equipmentId: string;
    rowsInserted: number;
  };
}

export function UploadCard({ onUpload, isLoading, lastResult }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [equipmentName, setEquipmentName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError('Selecione um arquivo CSV para enviar.');
      return;
    }

    try {
      setError(null);
      await onUpload(file, equipmentName);
      setFile(null);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Falha no upload';
      setError(message);
    }
  }

  return (
    <article className="card">
      <h2>Envio de Dados</h2>
      <p className="muted">Importe arquivos CSV de medições</p>

      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Arquivo CSV
          <input
            type="file"
            accept=".csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            disabled={isLoading}
          />
        </label>

        <label>
          Nome do Equipamento (opcional)
          <input
            type="text"
            placeholder="ex.: Transformador 01"
            value={equipmentName}
            onChange={(event) => setEquipmentName(event.target.value)}
            disabled={isLoading}
          />
        </label>

        <button type="submit" disabled={isLoading || !file}>
          {isLoading ? 'Processando...' : 'Enviar Arquivo'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {lastResult ? (
        <p className="success">
          equipmentId: <strong>{lastResult.equipmentId}</strong> | linhas: {lastResult.rowsInserted}
        </p>
      ) : null}
    </article>
  );
}
