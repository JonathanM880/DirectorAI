import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaxWidthHeightWrapperComponent } from "@/shared/components/ui/max-width-wrapper/max-width-wrapper.component";

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, MaxWidthHeightWrapperComponent],
  template: `
    <div class="page-container">
      <app-max-width-height-wrapper>
        <h2 class="text-2xl font-bold">Configuración</h2>
        <!-- 
        Quiero un texto que diga añadir canales 
        abajo tenga un componente parecido al channelGrid pero que solo tenga el logo de telgran y diga añadir canal de telegram. y lado (osea searia un grid de 1 columna y 2 filas) Que diga para añadir a telegram tienes que invitar a "direcdirectai"  a tu grupo de telegram y luego darle permisos de administrador. que aparezca un popover de spartan que pida un nombre para tu canal y el canal de telgram por el que habla (channel identifier) y pues un boton para crearlo

        abajo de eso quiero un texto que diga tus canales
        abajo  otro un div partido en dos igual que en en el dashboard(el que divide el channel grid con el app resizablegroup) en el primero:
        1. un componente parecido al channelgrid con los canales ya configurados creados (dos columnas, tan filas como canales) en el primer el canal igual que en el dashbaord pero el en el otro lado la opcion de editar con un pop over o eliminar  igual con un pocv
        2. en el segundo una tabla parecida al spartan-table-preview 
        -->
      </app-max-width-height-wrapper>
    </div>
  `,
  styles: [`
    .page-container {
      h2 { margin: 0 0 var(--space-4); }
      p { color: var(--color-gray-300); }
    }
  `]
})
export class SettingsComponent {}
