import { ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, close, downloadOutline, removeCircleOutline, shareSocialOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { Attachment, AttachmentsService } from '../../services/attachments.service';
import { saveAttachmentBlob, shareAttachmentBlob } from '../../shared/download-attachment.helper';
import { DownloadFileService } from '../../shared/download-file.service';
import { PdfPreviewService } from '../../shared/pdf-preview.service';
import { MIN_ZOOM, ZOOM_STEP, clampZoom, focalZoomScroll, isLikelyMouseWheel, touchDistance, touchMidpoint } from '../../shared/pinch-zoom';

/** Pixels por "linha" quando a roda vem em modo linha (Firefox), pro Ctrl+roda rolar. */
const WHEEL_LINE_PX = 40;

/**
 * Modal fullscreen de pré-visualização de um anexo, aberto pelo botão "Visualizar" (ícone de
 * olho) do popover de anexos. Imagem sempre renderiza direto num <img> (blob: URL).
 *
 * PDF tem dois caminhos, escolhidos por plataforma:
 * -- Web: <iframe src="blob:...">, que usa o visualizador de PDF nativo do navegador -- qualidade
 *    real (zoom, texto nítido/selecionável), sem nenhum processamento nosso.
 * -- App Android nativo: a WebView do Capacitor não tem visualizador de PDF embutido (confirmado
 *    num teste real: o mesmo <iframe> fica em branco lá), então cai pra `PdfPreviewService`
 *    (pdf.js), que rasteriza cada página como imagem -- pior qualidade que o iframe (daí não usar
 *    isso também na web), mas o único jeito de mostrar alguma coisa no app nativo.
 *
 * Zoom (imagem e PDF via canvas -- o PDF via iframe já tem o zoom embutido do próprio
 * visualizador nativo do navegador, então não duplica os controles aqui): botões de lupa
 * (+/-) na web e pinça de dois dedos no app, os dois ajustando o mesmo signal `zoom`. O
 * conteúdo cresce em largura real (não `transform: scale`, que não expande a área rolável de um
 * ancestral `overflow: auto`) dentro de um contêiner com scroll nativo. Navegar ampliado:
 * -- Toque: arrastar com um dedo usa o scroll nativo do contêiner (`touch-action: pan-x pan-y`).
 * -- Mouse: arrastar com o botão esquerdo (pan próprio via pointer events, mexendo no
 *    scrollLeft/scrollTop -- o scroll nativo só cobre roda/barra de rolagem, e a roda sozinha não
 *    anda na horizontal), além da roda e das barras de rolagem, que ficam visíveis.
 * Todo zoom (pinça, roda do mouse na web / Ctrl+roda no app, pinça do trackpad, botões, duplo clique) é ancorado num ponto
 * focal -- o trecho que estava sob os dedos/cursor/centro continua no lugar, em vez de o zoom
 * sempre pular pro canto superior esquerdo (`focalZoomScroll`).
 */
@Component({
  selector: 'app-attachment-preview-modal',
  templateUrl: './attachment-preview-modal.component.html',
  styleUrls: ['./attachment-preview-modal.component.scss'],
  imports: [IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonContent, IonSpinner],
})
export class AttachmentPreviewModalComponent implements OnInit, OnDestroy {
  @Input({ required: true }) file!: Attachment;

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly blobPreviewUrl = signal<SafeResourceUrl | null>(null);
  readonly pdfPages = signal<string[]>([]);
  readonly downloading = signal(false);
  readonly zoom = signal(1);
  readonly sharing = signal(false);
  /** Botão "Compartilhar" só no celular (APK ou navegador de toque) -- ver `canShareAttachment`. */
  readonly canShare: boolean;

  private blob: Blob | null = null;
  private objectUrl: string | null = null;
  private pinchStartDistance: number | null = null;
  private pinchStartZoom = 1;
  private dragStart: { x: number; y: number; scrollLeft: number; scrollTop: number } | null = null;
  readonly dragging = signal(false);

  @ViewChild('viewport') private viewportRef?: ElementRef<HTMLElement>;

  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly downloadFileService: DownloadFileService,
    private readonly pdfPreviewService: PdfPreviewService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
  ) {
    addIcons({ close, downloadOutline, addCircleOutline, removeCircleOutline, shareSocialOutline });
    this.canShare = downloadFileService.canShareAttachment();
  }

  get isImage(): boolean {
    return this.file.content_type.startsWith('image/');
  }

  get isPdf(): boolean {
    return this.file.content_type === 'application/pdf';
  }

  get isPdfViaIframe(): boolean {
    return this.isPdf && !Capacitor.isNativePlatform();
  }

  get isPdfViaCanvas(): boolean {
    return this.isPdf && Capacitor.isNativePlatform();
  }

  get hasBlob(): boolean {
    return this.blob !== null;
  }

  get canZoom(): boolean {
    return this.isImage || this.isPdfViaCanvas;
  }

  async ngOnInit(): Promise<void> {
    try {
      this.blob = await firstValueFrom(this.attachmentsService.downloadBlob(this.file.id));
      if (this.isImage || this.isPdfViaIframe) {
        this.objectUrl = URL.createObjectURL(this.blob);
        this.blobPreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
      } else if (this.isPdfViaCanvas) {
        const pages = await this.pdfPreviewService.renderPagesAsDataUrls(this.blob);
        if (!pages.length) {
          this.errorMessage.set('Não foi possível pré-visualizar este PDF.');
        }
        this.pdfPages.set(pages);
      }
    } catch (err) {
      console.error('Erro ao carregar anexo pra pré-visualização', err);
      this.errorMessage.set('Não foi possível carregar a pré-visualização.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }

  async download(): Promise<void> {
    if (!this.blob) return;
    this.downloading.set(true);
    await saveAttachmentBlob(this.blob, this.file.original_filename, this.downloadFileService, this.toastCtrl);
    this.downloading.set(false);
  }

  /** Reaproveita o blob já carregado pra pré-visualização, sem buscar de novo. */
  async share(): Promise<void> {
    if (!this.blob) return;
    this.sharing.set(true);
    await shareAttachmentBlob(this.blob, this.file.original_filename, this.downloadFileService, this.toastCtrl);
    this.sharing.set(false);
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  zoomIn(): void {
    this.setZoom(this.zoom() + ZOOM_STEP);
  }

  zoomOut(): void {
    this.setZoom(this.zoom() - ZOOM_STEP);
  }

  /**
   * Aplica um novo zoom mantendo parado o ponto do conteúdo sob `focal` (coordenada da tela). Sem
   * `focal`, usa o centro da área visível (botões de lupa). Força a detecção de mudanças na hora
   * pra medir o tamanho novo do conteúdo e já corrigir o scroll no mesmo frame, sem "piscar".
   */
  private setZoom(value: number, focal?: { clientX: number; clientY: number }): void {
    const next = clampZoom(value);
    if (next === this.zoom()) return;
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) {
      this.zoom.set(next);
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const point = focal
      ? { x: focal.clientX - rect.left, y: focal.clientY - rect.top }
      : { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    const before = {
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      scrollWidth: viewport.scrollWidth,
      scrollHeight: viewport.scrollHeight,
    };
    this.zoom.set(next);
    this.cdr.detectChanges();
    const { left, top } = focalZoomScroll(before, viewport, point);
    viewport.scrollLeft = left;
    viewport.scrollTop = top;
  }

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      this.pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
      this.pinchStartZoom = this.zoom();
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 2 || this.pinchStartDistance === null) return;
    event.preventDefault();
    const currentDistance = touchDistance(event.touches[0], event.touches[1]);
    const scaleFactor = currentDistance / this.pinchStartDistance;
    this.setZoom(this.pinchStartZoom * scaleFactor, touchMidpoint(event.touches[0], event.touches[1]));
  }

  onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.pinchStartDistance = null;
    }
  }

  /**
   * Roda/trackpad sobre a pré-visualização. A pinça do trackpad chega como wheel + ctrlKey e
   * sempre dá zoom contínuo; dois dedos no trackpad sem Ctrl ficam com o scroll nativo.
   * Roda de mouse (`isLikelyMouseWheel`):
   * -- Web: sozinha dá zoom (um passo de lupa por clique, ancorado no cursor); Shift+roda deixa o
   *    scroll horizontal nativo e Ctrl+roda rola na vertical (feito aqui, porque o padrão do
   *    navegador pra Ctrl+roda é dar zoom na página inteira).
   * -- App nativo: comportamento antigo (Ctrl+roda dá zoom, sozinha rola) -- no celular quase
   *    nunca tem mouse, e a mudança foi pedida só pra web.
   */
  onWheel(event: WheelEvent): void {
    const mouseWheel = isLikelyMouseWheel(event);
    if (!mouseWheel || Capacitor.isNativePlatform()) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      this.setZoom(this.zoom() * Math.exp(-event.deltaY * 0.002), event);
      return;
    }
    if (event.shiftKey) return;
    event.preventDefault();
    if (event.ctrlKey) {
      const viewport = this.viewportRef?.nativeElement;
      if (viewport) viewport.scrollTop += event.deltaMode === 0 ? event.deltaY : event.deltaY * WHEEL_LINE_PX;
      return;
    }
    this.setZoom(this.zoom() + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event);
  }

  /** Duplo clique/toque: amplia 2x no ponto clicado, ou volta pro tamanho original se já ampliado. */
  onDoubleClick(event: MouseEvent): void {
    this.setZoom(this.zoom() > MIN_ZOOM ? MIN_ZOOM : 2, event);
  }

  /** Arrastar com o mouse pra navegar quando ampliado -- toque fica com o scroll nativo. */
  onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0 || this.zoom() <= MIN_ZOOM) return;
    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) return;
    event.preventDefault();
    viewport.setPointerCapture?.(event.pointerId);
    this.dragStart = { x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
    this.dragging.set(true);
  }

  onPointerMove(event: PointerEvent): void {
    const viewport = this.viewportRef?.nativeElement;
    if (!this.dragStart || !viewport) return;
    viewport.scrollLeft = this.dragStart.scrollLeft - (event.clientX - this.dragStart.x);
    viewport.scrollTop = this.dragStart.scrollTop - (event.clientY - this.dragStart.y);
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragStart) return;
    this.viewportRef?.nativeElement.releasePointerCapture?.(event.pointerId);
    this.dragStart = null;
    this.dragging.set(false);
  }
}
