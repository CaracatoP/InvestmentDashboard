import type { AiChatStructuredResponse } from "../../types/ai";
import { StructuredResponse } from "./StructuredResponse";

type AiStructuredMessageProps = {
  response: AiChatStructuredResponse;
  onSend: (message: string) => void;
  isLoading?: boolean;
};

export function AiStructuredMessage({ response, onSend, isLoading }: AiStructuredMessageProps) {
  return <StructuredResponse response={response} onSend={onSend} isLoading={isLoading} />;
}
