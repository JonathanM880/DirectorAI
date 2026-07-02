import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { AuditLogEntry } from '../../services/scheduling-engine.service';

@Component({
	selector: 'spartan-table-preview',
	standalone: true,
	imports: [HlmTableImports, CommonModule],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'w-full',
	},
	template: `
		<div hlmTableContainer>
			<table hlmTable>
				<caption hlmTableCaption>Historial reciente de auditoría</caption>
				<thead hlmTableHeader>
					<tr hlmTableRow>
						<th hlmTableHead class="w-[150px]">Acción</th>
						<th hlmTableHead>Plataforma</th>
						<th hlmTableHead>Fecha</th>
						<th hlmTableHead class="text-right">Código de Error</th>
					</tr>
				</thead>
				<tbody hlmTableBody>
					@for (log of logs(); track log.id) {
						<tr hlmTableRow>
							<td hlmTableCell class="font-medium capitalize">{{ translateAction(log.action) }}</td>
							<td hlmTableCell>{{ translatePlatform(log.platform) }}</td>
							<td hlmTableCell>{{ log.occurredAt | date:'medium' }}</td>
							<td hlmTableCell class="text-right font-mono text-xs">{{ log.errorCode || '-' }}</td>
						</tr>
					} @empty {
						<tr hlmTableRow>
							<td hlmTableCell [attr.colSpan]="4" class="text-center text-gray-400 py-4">
								No hay registros en el historial.
							</td>
						</tr>
					}
				</tbody>
				<tfoot hlmTableFooter>
					<tr hlmTableRow>
						<td hlmTableCell [attr.colSpan]="3">Total registros</td>
						<td hlmTableCell class="text-right">{{ totalLogs() }}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	`,
})
export class TablePreview implements OnInit {
	private auditLogService = inject(AuditLogService);

	logs = signal<AuditLogEntry[]>([]);
	totalLogs = signal<number>(0);

	async ngOnInit() {
		try {
			const result = await this.auditLogService.getAuditLog({
				page: 0,
				pageSize: 10
			});
			this.logs.set(result.rows);
			this.totalLogs.set(result.total);
		} catch (error) {
			console.error('Error loading audit log preview:', error);
		}
	}

	translateAction(action: string): string {
		const map: Record<string, string> = {
			published: 'Publicado',
			failed: 'Fallido',
			retried: 'Reintentado',
			cancelled: 'Cancelado',
			edited: 'Editado',
			deleted: 'Eliminado'
		};
		return map[action.toLowerCase()] || action;
	}

	translatePlatform(platform: string): string {
		if (!platform) return '-';
		const map: Record<string, string> = {
			telegram: 'Telegram',
			twitter: 'Twitter',
			instagram: 'Instagram',
			linkedin: 'LinkedIn'
		};
		return map[platform.toLowerCase()] || platform;
	}
}