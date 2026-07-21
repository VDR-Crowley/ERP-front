import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDrag, CdkDragEnd, CdkDragHandle, CdkDragMove } from '@angular/cdk/drag-drop';
import { BottomSheetAction } from './bottom-sheet.types';

/** Distância mínima arrastada (proporção da altura do painel) pra fechar ao soltar. */
const CLOSE_DISTANCE_RATIO = 0.3;
/** Velocidade mínima (px/ms) que fecha mesmo com pouca distância — gesto de "flick". */
const CLOSE_FLICK_VELOCITY = 0.6;
const CLOSE_FLICK_MIN_DISTANCE = 24;
const VELOCITY_SAMPLE_SIZE = 5;

/**
 * Bottom sheet reutilizável do design system (`components-ds`): painel que
 * sobe do rodapé no mobile/tablet, com backdrop e arraste-para-fechar via
 * `CdkDrag`/`CdkDragHandle` na alça. Fica sempre no DOM (visibilidade via
 * `open`) pra manter o `CdkDrag` estável entre aberturas — evita reconstruir
 * a diretiva a cada toggle.
 *
 * Acima do breakpoint mobile/tablet (768px, ver `bottom-sheet.scss`) vira um
 * wrapper transparente (`display: contents` nas camadas internas): sem
 * backdrop, sem posição fixa, sem arraste — o conteúdo projetado (`ng-content`)
 * flui normalmente dentro do container do chamador (ex.: barra de filtro
 * inline no desktop).
 */
@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  imports: [CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bottom-sheet.html',
  styleUrl: './bottom-sheet.scss',
})
export class BottomSheet {
  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  readonly description = input<string>('');
  readonly actions = input<BottomSheetAction[]>([]);
  readonly closeOnBackdropClick = input<boolean>(true);
  readonly ariaLabel = input<string>('Filtro');
  readonly openChange = output<boolean>();

  private readonly sheetRef = viewChild<ElementRef<HTMLElement>>('sheet');

  /** Deslocamento livre aplicado pelo `CdkDrag` durante o arraste. */
  protected readonly dragPosition = signal({ x: 0, y: 0 });
  /** Enquanto arrastando, a transição CSS fica desligada pra seguir o dedo 1:1. */
  protected readonly dragging = signal(false);

  protected readonly hasHeader = computed(() => !!this.title() || !!this.description());
  protected readonly hasActions = computed(() => this.actions().length > 0);

  private dragSamples: { y: number; t: number }[] = [];

  protected requestClose(): void {
    this.openChange.emit(false);
  }

  protected onBackdropMouseDown(): void {
    if (this.closeOnBackdropClick()) {
      this.requestClose();
    }
  }

  protected onDragStarted(): void {
    this.dragging.set(true);
    this.dragSamples = [];
  }

  /** Não deixa arrastar pra cima além do repouso — só fecha puxando pra baixo. */
  protected onDragMoved(event: CdkDragMove): void {
    this.dragPosition.set({ x: 0, y: Math.max(0, event.distance.y) });
    this.dragSamples.push({ y: event.pointerPosition.y, t: Date.now() });
    if (this.dragSamples.length > VELOCITY_SAMPLE_SIZE) {
      this.dragSamples.shift();
    }
  }

  protected onDragEnded(event: CdkDragEnd): void {
    const distance = Math.max(0, event.distance.y);
    const height = this.sheetRef()?.nativeElement.offsetHeight ?? 0;
    const velocity = this.dragVelocity();

    this.dragSamples = [];
    this.dragging.set(false);
    event.source.reset();
    this.dragPosition.set({ x: 0, y: 0 });

    const closedByDistance = height > 0 && distance > height * CLOSE_DISTANCE_RATIO;
    const closedByFlick = velocity > CLOSE_FLICK_VELOCITY && distance > CLOSE_FLICK_MIN_DISTANCE;

    if (closedByDistance || closedByFlick) {
      this.requestClose();
    }
  }

  protected onActionClick(action: BottomSheetAction): void {
    action.action?.();
    if (action.closeOnClick !== false) {
      this.requestClose();
    }
  }

  protected resolveIntent(action: BottomSheetAction, index: number): 'primary' | 'ghost' {
    return action.intent ?? (index === 0 ? 'primary' : 'ghost');
  }

  private dragVelocity(): number {
    if (this.dragSamples.length < 2) return 0;
    const first = this.dragSamples[0];
    const last = this.dragSamples[this.dragSamples.length - 1];
    const elapsed = last.t - first.t;
    return elapsed > 0 ? (last.y - first.y) / elapsed : 0;
  }
}
