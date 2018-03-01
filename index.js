import * as maptalks from 'maptalks';
import * as echarts from 'echarts';
import * as echartsgl from 'echarts-gl';
/**
 * set echart container dom attribute
 */
const options = {
    'container': 'front',
    'renderer': 'dom',
    'hideOnZooming': false,
    'hideOnMoving': false,
    'hideOnRotating': false
};

export class E4Layer extends maptalks.Layer {

    constructor(id, ecOptions, options, maptalksLayer = null) {
        super(id, options);
        this._ecOptions = ecOptions;
        this._maptalksLayer = maptalksLayer;
    }

    getEChartsOption() {
        return this._ecOptions;
    }
    
    getAdditionalLayer(){
        return this._maptalksLayer;
    }

    setEChartsOption(ecOption) {
        this._ecOptions = ecOption;
        if (this._getRenderer()) {
            this._getRenderer()._clearAndRedraw();
        }
        return this;
    }

    /**
     * Export the E3Layer's JSON.
     * @return {Object} layer's JSON
     */
    toJSON() {
        return {
            'type': this.getJSONType(),
            'id': this.getId(),
            'ecOptions': this._ecOptions,
            'options': this.config()
        };
    }

    /**
     * Reproduce an E3Layer from layer's JSON.
     * @param  {Object} json - layer's JSON
     * @return {maptalks.E3Layer}
     * @static
     * @private
     * @function
     */
    static fromJSON(json) {
        if (!json || json['type'] !== 'E3Layer') { return null; }
        return new E4Layer(json['id'], json['ecOptions'], json['options']);
    }
}

E4Layer.mergeOptions(options);

E4Layer.registerJSONType('E4Layer');

E4Layer.registerRenderer('dom', class {

    constructor(layer) {
        this.layer = layer;
    }

    render() {
        //init Container
        if (!this._container) {
            this._createLayerContainer();
        }
        //init echart
        if (!this._ec) {
            this._ec = echarts.init(this._container);
            this._prepareECharts();
            this._ec.setOption(this.layer._ecOptions, false);
            this._ecMaptalks3D = this._ec.getModel().getComponent('maptalks3D');
            this._ecMaptalks2D = this._ec.getModel().getComponent('maptalks2D');
            if(this._ecMaptalks){
                this._ecMaptalks = this._ecMaptalks3D.getMaptalks();
                this._ecMaptalks.removeBaseLayer();
            }
        }
        //resize 
        else if (this._isVisible()) {
            this._ec.resize();
        }
        //
        this.layer.fire('layerload');
    }

    drawOnInteracting() {
        if (this._isVisible()) {
            this._clearAndRedraw();
        }
    }

    needToRedraw() {
        const map = this.getMap();
        const renderer = map._getRenderer();
        return map.isInteracting() || renderer && (renderer.isStateChanged && renderer.isStateChanged() || renderer.isViewChanged && renderer.isViewChanged());
    }

    getMap() {
        return this.layer.getMap();
    }

    _isVisible() {
        return this._container && this._container.style.display === '';
    }

    show() {
        if (this._container) {
            this._container.style.display = '';
        }
    }

    hide() {
        if (this._container) {
            this._container.style.display = 'none';
        }
    }

    remove() {
        this._ec.clear();
        this._ec.dispose();
        delete this._ec;
        this._removeLayerContainer();
    }

    clear() {
        this._ec.clear();
    }

    setZIndex(z) {
        this._zIndex = z;
        if (this._container) {
            this._container.style.zIndex = z;

        }
    }

    isCanvasRender() {
        return false;
    }

    _prepareECharts() {
        //ecOptions
        const ecOptions = this.layer._ecOptions,
            map = this.getMap(),
            center = map.getCenter(),
            zoom = map.getZoom(),
            pitch = map.getPitch(),
            bearing = map.getBearing();
        //1.register maptalks3D
        if(!ecOptions.maptalks3D)
            ecOptions.maptalks3D = {};
        ecOptions.maptalks3D.center = [center.x, center.y];
        ecOptions.maptalks3D.zoom = zoom;
        ecOptions.maptalks3D.pitch = pitch;
        ecOptions.maptalks3D.bearing = bearing;
        //2dcoordsys
        const maptalks2DCoordSys = this._getE3CoordinateSystem(map);
        //2dmodal
        const maptalks2DModal = echarts.extendComponentModel({
            type:'maptalks2D',
            getMaptalks:function(){
                return this.__maptalks2D;
            },
            defaultOption: {
                center: [104.114129, 37.550339],
                zoom: 5,
            }
        })
        //2dview
        const maptalks2DView = echarts.extendComponentView({
            type:'maptalks2D',
            render:function(maptalksModel,ecModel,api){

            }
        })
        //
        echarts.registerCoordinateSystem('maptalks2D', maptalks2DCoordSys); // Action
    }

    _getE3CoordinateSystem(map){
        const CoordSystem = function (map) {
            this.map = map;
            this._mapOffset = [0, 0];
        };
        const me = this;
        CoordSystem.create = function (ecModel/*, api*/) {
           ecModel.eachComponent('maptalks2D',function(maptalks2DModel){
                maptalks2DModel.coordinateSystem = CoordSystem;
           })
            // ecModel.eachSeries(function (seriesModel) {
            //     if (seriesModel.get('coordinateSystem') === me._coordSystemName) {
            //         seriesModel.coordinateSystem = new CoordSystem(map);
            //     }
            // });
        };

        CoordSystem.getDimensionsInfo = function () {
            return ['x', 'y'];
        };

        CoordSystem.dimensions = ['x', 'y'];

        maptalks.Util.extend(CoordSystem.prototype, {
            dimensions : ['x', 'y'],

            setMapOffset(mapOffset) {
                this._mapOffset = mapOffset;
            },

            dataToPoint(data) {
                const coord = new maptalks.Coordinate(data);
                const px = this.map.coordinateToContainerPoint(coord);
                const mapOffset = this._mapOffset;
                return [px.x - mapOffset[0], px.y - mapOffset[1]];
            },

            pointToData(pt) {
                const mapOffset = this._mapOffset;
                const data = this.map.containerPointToCoordinate({
                    x: pt[0] + mapOffset[0],
                    y: pt[1] + mapOffset[1]
                });
                return [data.x, data.y];
            },

            getViewRect() {
                const size = this.map.getSize();
                return new echarts.graphic.BoundingRect(0, 0, size.width, size.height);
            },

            getRoamTransform() {
                return echarts.matrix.create();
            }
        });

        return CoordSystem;  
    }

    _createLayerContainer() {
        const container = this._container = maptalks.DomUtil.createEl('div');
        container.style.cssText = 'position:absolute;left:0px;top:0px;';
        if (this._zIndex) {
            container.style.zIndex = this._zIndex;
        }
        this._resetContainer();
        const parentContainer = this.layer.options['container'] === 'front' ? this.getMap()._panels['frontStatic'] : this.getMap()._panels['backStatic'];
        parentContainer.appendChild(container);
    }

    _removeLayerContainer() {
        if (this._container) {
            maptalks.DomUtil.removeDomNode(this._container);
        }
        delete this._levelContainers;
    }

    _resetContainer() {
        const size = this.getMap().getSize();
        this._container.style.width = size.width + 'px';
        this._container.style.height = size.height + 'px';
    }

    getEvents() {
        return {
            '_zoomstart': this.onZoomStart,
            '_zoomend': this.onZoomEnd,
            '_dragrotatestart': this.onDragRotateStart,
            '_dragrotateend': this.onDragRotateEnd,
            '_movestart': this.onMoveStart,
            '_moveend': this.onMoveEnd,
            '_resize': this._resetContainer
        };
    }

    _clearAndRedraw() {
        if (this._container && this._container.style.display === 'none') {
            return;
        }
        //this._ec.clear();
        const map = this.getMap(),
            center = map.getCenter(),
            zoom = map.getZoom(),
            pitch = map.getPitch(),
            bearing = map.getBearing();
        const ecMaptalks = this._ecMaptalks;
        if(ecMaptalks){
            ecMaptalks.setCenter([center.x, center.y]);
            ecMaptalks.setZoom(zoom);
            ecMaptalks.setPitch(pitch);
            ecMaptalks.setBearing(bearing);
        }
    }

    onZoomStart() {
        if (!this.layer.options['hideOnZooming']) {
            return;
        }
        this.hide();
    }

    onZoomEnd() {
        if (!this.layer.options['hideOnZooming']) {
            return;
        }
        this.show();
        this._clearAndRedraw();
    }

    onDragRotateStart() {
        if (!this.layer.options['hideOnRotating']) {
            return;
        }
        this.hide();
    }

    onDragRotateEnd() {
        if (!this.layer.options['hideOnRotating']) {
            return;
        }
        this.show();
        this._clearAndRedraw();
    }

    onMoveStart() {
        if (!this.layer.options['hideOnMoving']) {
            return;
        }
        this.hide();
    }

    onMoveEnd() {
        if (!this.layer.options['hideOnMoving']) {
            return;
        }
        this.show();
        this._clearAndRedraw();
    }

});