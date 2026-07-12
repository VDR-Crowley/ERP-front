import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { IdbSeedService } from '@core/idb/idb-seed.service';
import { OwnerBootstrapService } from '@core/services/owner-bootstrap.service';

// Aura's default light primary.color ({primary.500}) fails WCAG AA contrast
// (2.53:1) against its white contrastColor. Bumped to {primary.700} (5.48:1).
const AccessibleAura = definePreset(Aura, {
  semantic: {
    colorScheme: {
      light: {
        primary: {
          color: '{primary.700}',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}',
        },
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: AccessibleAura,
        options: {
          darkModeSelector: '.app-dark',
        },
      },
      translation: {
        today: 'Hoje',
        clear: 'Limpar',
        dayNames: [
          'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
          'quinta-feira', 'sexta-feira', 'sábado',
        ],
        dayNamesShort: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
        dayNamesMin: ['Do', 'Se', 'Te', 'Qu', 'Qu', 'Se', 'Sa'],
        monthNames: [
          'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
          'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
        ],
        monthNamesShort: [
          'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
          'jul', 'ago', 'set', 'out', 'nov', 'dez',
        ],
        firstDayOfWeek: 0,
      },
    }),
    provideAppInitializer(() => {
      const idbSeed = inject(IdbSeedService);
      const ownerBootstrap = inject(OwnerBootstrapService);
      return firstValueFrom(idbSeed.seed()).then(() => ownerBootstrap.run());
    }),
  ],
};
