import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './supabase.tokens';
import { CopyRequest, GeneratedAsset } from '@director-ai/types';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GenAiService {
  private supabase = inject(SupabaseClient);

  streamGenerate(request: CopyRequest): Observable<string> {
    return new Observable<string>(observer => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const abortController = new AbortController();

      const run = async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${SUPABASE_URL}/functions/v1/gen-ai-studio`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ action: 'streamGenerate', payload: request }),
            signal: abortController.signal
          });

          if (!response.ok) {
            throw new Error(`Generation failed: ${response.statusText}`);
          }

          if (!response.body) throw new Error('No readable stream from response');

          reader = response.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            
            // Assuming the edge function forwards the chunks directly, or wraps them in SSE.
            // If it's direct string chunks, we just emit them:
            observer.next(chunk);
          }
          
          observer.complete();
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          observer.error(err);
        }
      };

      run();

      return () => {
        abortController.abort();
        if (reader) {
          reader.cancel().catch(() => {});
        }
      };
    });
  }

  async brainstorm(request: any): Promise<any> {
    const { data, error } = await this.supabase.functions.invoke('gen-ai-studio', {
      body: { action: 'brainstorm', payload: request }
    });
    if (error) throw error;
    return data;
  }

  async generateImage(request: any): Promise<any> {
    const { data, error } = await this.supabase.functions.invoke('gen-ai-studio', {
      body: { action: 'generateImage', payload: request }
    });
    if (error) throw error;
    return data;
  }
}
