import {ipcMain} from 'electron';
import {VIEW_Y_OFFSET} from '~/constants/design';
import {View} from './view';
import {AppWindow} from './windows';
import {WEBUI_BASE_URL} from '~/constants/files';

import {
  ZOOM_FACTOR_MIN,
  ZOOM_FACTOR_MAX,
  ZOOM_FACTOR_INCREMENT,
} from '~/constants/web-contents';
import {EventEmitter} from 'events';
import {Application} from './application';

export class ViewManager extends EventEmitter {
  public views = new Map<number, View>();
  public selectedId = 0;
  public _fullscreen = false;

  public incognito: boolean;

  private window: AppWindow;

  public get fullscreen() {
    return this._fullscreen;
  }

  public getById(id: number) {
    return this.views.get(id);
  }

  public set fullscreen(val: boolean) {
    this._fullscreen = val;
    this.fixBounds();
  }

  public constructor(window: AppWindow, incognito: boolean) {
    super();

    this.window = window;
    this.incognito = incognito;

    const {id} = window.win;
    ipcMain.handle(`view-create-${id}`, (e, details) => {
      return this.create(details, false, false).id;
    });

    ipcMain.handle(`views-create-${id}`, (e, options) => {
      return options.map((option: any) => {
        return this.create(option, false, false).id;
      });
    });

    ipcMain.on(`add-tab-${id}`, (e, details) => {
      this.create(details);
    });

    ipcMain.on('open-dev-tool', (e, details) => {
      //this.views.get(this.selectedId).webContents.print();
      this.selected.webContents.inspectElement(0, 0);
      if (this.selected.webContents.isDevToolsOpened()) {
        this.selected.webContents.devToolsWebContents.focus();
      }
    });

    ipcMain.handle(`view-select-${id}`, (e, id: number, focus: boolean) => {
      // if (process.env.ENABLE_EXTENSIONS) {
      //   extensions.tabs.activate(id, focus);
      // } else {
      //   this.select(id, focus);
      // }
      this.select(id, focus, true);
    });

    ipcMain.on(`view-destroy-${id}`, (e, id: number) => {
      this.destroy(id);
    });

    ipcMain.on(`mute-view-${id}`, (e, tabId: number) => {
      const view = this.views.get(tabId);
      view.webContents.setAudioMuted(true);
    });

    ipcMain.on(`unmute-view-${id}`, (e, tabId: number) => {
      const view = this.views.get(tabId);
      view.webContents.setAudioMuted(false);
    });

    ipcMain.on(`browserview-clear-${id}`, () => {
      this.clear();
    });

    ipcMain.on('change-zoom', (e, zoomDirection) => {
      this.changeZoom(zoomDirection, e);
    });

    ipcMain.on('reset-zoom', (e) => {
      this.resetZoom();
    });

    this.setBoundsListener();
  }

  public resetZoom() {
    this.selected.webContents.zoomFactor = 1;
    this.selected.emitEvent(
      'zoom-updated',
      this.selected.webContents.zoomFactor,
    );
    this.emitZoomUpdate();
  }

  public changeZoom(zoomDirection: 'in' | 'out', e?: any) {
    const newZoomFactor =
      this.selected.webContents.zoomFactor +
      (zoomDirection === 'in'
        ? ZOOM_FACTOR_INCREMENT
        : -ZOOM_FACTOR_INCREMENT);

    if (
      newZoomFactor <= ZOOM_FACTOR_MAX &&
      newZoomFactor >= ZOOM_FACTOR_MIN
    ) {
      this.selected.webContents.zoomFactor = newZoomFactor;
      this.selected.emitEvent(
        'zoom-updated',
        this.selected.webContents.zoomFactor,
      );
    } else {
      e?.preventDefault();
    }
    this.emitZoomUpdate();
  }

  public get selected() {
    return this.views.get(this.selectedId);
  }

  public get settingsView() {
    return Object.values(this.views).find((r) =>
      r.url.startsWith(`${WEBUI_BASE_URL}settings`),
    );
  }

  public findByKey(key: string): View {
    return Object.values(this.views).find((r) =>
      r.url.includes(`${key}`),
    );
  }

  public create(
    details: chrome.tabs.CreateProperties,
    isNext = false,
    sendMessage = true,
  ) {
    const view = new View(this.window, details.url, this.incognito);

    const {webContents} = view.browserView;
    const {id} = view;

    this.views.set(id, view);

    if (process.env.ENABLE_EXTENSIONS) {
      //extensions.tabs.observe(webContents);
    }

    webContents.once('destroyed', () => {
      this.views.delete(id);
    });

    if (sendMessage) {
      this.window.send('create-tab', {...details}, isNext, id);
    }
    return view;
  }

  public removeByTabId(id: number) {
    this.window.send('remove-tab', id);
  }

  public clear() {
    this.window.win.setBrowserView(null);
    Object.values(this.views).forEach((x) => x.destroy());
  }

  public select(id: number, focus = true, callExtension = false) {
    const {selected} = this;
    const view = this.views.get(id);

    if (!view) {
      return;
    }

    this.selectedId = id;

    if (selected) {
      this.window.win.removeBrowserView(selected.browserView);
    }

    this.window.win.addBrowserView(view.browserView);

    if (focus) {
      // Also fixes switching tabs with Ctrl + Tab
      view.webContents.focus();
    } else {
      this.window.webContents.focus();
    }

    this.window.updateTitle();
    view.updateBookmark();

    this.fixBounds();

    view.updateNavigationState();

    this.emit('activated', id);
    if (callExtension) {
      Application.instance.sessions.chromeExtensions.selectTab(view.webContents);
    }

    // TODO: this.emitZoomUpdate(false);
  }


  private timer: any = null;
  public async fixBounds() {
    return this.fixBounds0(0);
  }
  public async fixBounds0(count: number) {
    const view = this.selected;

    if (!view) return;
    try {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    } catch (e) {
    }

    const {width, height} = this.window.win.getContentBounds();

    const toolbarContentHeight = await this.window.win.webContents
      .executeJavaScript(`
      document.getElementById('app').offsetHeight
    `);
    if (toolbarContentHeight <= 0 && count < 40) {
      this.timer = setTimeout(() => {
        this.fixBounds0(count + 1);
      }, 25);
    }

    const newBounds = {
      x: 0,
      y: this.fullscreen ? 0 : toolbarContentHeight,
      width,
      height: this.fullscreen ? height : height - toolbarContentHeight,
    };

    if (newBounds !== view.bounds) {
      console.log("fixBounds", toolbarContentHeight, width, height);
      view.browserView.setBounds(newBounds);
      view.bounds = newBounds;
    }
  }

  private setBoundsListener() {
    // resize the BrowserView's height when the toolbar height changes
    // ex: when the bookmarks bar appears
    this.window.webContents.executeJavaScript(`
        const {ipcRenderer} = require('electron');
        const resizeObserver = new ResizeObserver(([{ contentRect }]) => {
          ipcRenderer.send('resize-height');
        });
        const app = document.getElementById('app');
        resizeObserver.observe(app);
      `);

    this.window.webContents.on('ipc-message', (e, message) => {
      if (message === 'resize-height') {
        this.fixBounds();
      }
    });
  }

  public destroy(id: number) {
    const view = this.views.get(id);

    this.views.delete(id);

    if (view && !view.browserView.webContents.isDestroyed()) {
      this.window.win.removeBrowserView(view.browserView);
      view.destroy();
      this.emit('removed', id);
    }
  }

  public emitZoomUpdate(showDialog = true) {
    Application.instance.dialogs
      .getDynamic('zoom')
      ?.browserView?.webContents?.send(
      'zoom-factor-updated',
      this.selected.webContents.zoomFactor,
    );

    this.window.webContents.send(
      'zoom-factor-updated',
      this.selected.webContents.zoomFactor,
      showDialog,
    );
  }
}
