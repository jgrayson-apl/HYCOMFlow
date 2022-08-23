/*
 Copyright 2020 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/*
 *
 * https://developers.arcgis.com/javascript/latest/sample-code/sandbox/?sample=layers-imagery-afrenderer
 * https://codepen.io/john-grayson/pen/vYWvKry
 *
 * winds: https://codepen.io/annefitz/pen/LYOXmPx?editors=1000
 *
 */

import AppBase from "./support/AppBase.js";
import AppLoader from "./loaders/AppLoader.js";

class Application extends AppBase {

  // PORTAL //
  portal;

  constructor() {
    super();

    // LOAD APPLICATION BASE //
    super.load().then(() => {

      // APPLICATION LOADER //
      const applicationLoader = new AppLoader({app: this});
      applicationLoader.load().then(({portal, group, map, view}) => {
        //console.info(portal, group, map, view);

        // PORTAL //
        this.portal = portal;

        // APP TITLE //
        this.title = this.title || map?.portalItem?.title || 'Application';
        // APP DESCRIPTION //
        this.description = this.description || map?.portalItem?.description || group?.description || '...';

        // USER SIGN-IN //
        this.configUserSignIn();

        // APPLICATION //
        this.applicationReady({portal, group, map, view}).catch(this.displayError).then(() => {
          // HIDE APP LOADER //
          document.getElementById('app-loader').removeAttribute('active');
        });

      }).catch(this.displayError);
    }).catch(this.displayError);

  }

  /**
   *
   */
  configUserSignIn() {
    if (this.oauthappid || this.portal?.user) {

      const signIn = document.getElementById('sign-in');
      signIn && (signIn.portal = this.portal);

    }
  }

  /**
   *
   * @param view
   */
  configView(view) {
    return new Promise((resolve, reject) => {
      if (view) {
        require([
          'esri/widgets/Home',
          'esri/widgets/Search',
          'esri/widgets/LayerList',
          'esri/widgets/Legend',
          'esri/widgets/Bookmarks'
        ], (Home, Search, LayerList, Legend, Bookmarks) => {

          //
          // CONFIGURE VIEW SPECIFIC STUFF HERE //
          //
          view.set({
            constraints: {snapToZoom: false},
            qualityProfile: "high"
          });

          // HOME //
          const home = new Home({view});
          view.ui.add(home, {position: 'top-left', index: 0});

          // LEGEND //
          const legend = new Legend({container: 'legend-container', view: view});

          // BOOKMARKS //
          const bookmarks = new Bookmarks({container: 'bookmarks-container', view: view});

          // SEARCH /
          /*
           const search = new Search({ view: view});
           view.ui.add(legend, {position: 'top-right', index: 0});
           */

          // LAYER LIST //
          /*const layerList = new LayerList({
           container: 'layer-list-container',
           view: view,
           listItemCreatedFunction: (event) => {
           event.item.open = (event.item.layer.type === 'group');
           },
           visibleElements: {statusIndicators: true}
           });*/

          // VIEW UPDATING //
          this.disableViewUpdating = false;
          const viewUpdating = document.getElementById('view-updating');
          view.ui.add(viewUpdating, 'bottom-right');
          this._watchUtils.init(view, 'updating', updating => {
            (!this.disableViewUpdating) && viewUpdating.toggleAttribute('active', updating);
          });

          resolve();
        });
      } else { resolve(); }
    });
  }

  /**
   *
   * @param portal
   * @param group
   * @param map
   * @param view
   * @returns {Promise}
   */
  applicationReady({portal, group, map, view}) {
    return new Promise(async (resolve, reject) => {
      // VIEW READY //
      this.configView(view).then(() => {

        this.initializeDataCharts();

        this.initializeHYCOMLayers({view}).then(({currentsLayer, hycomLayer}) => {

          this.initializeVariables({view, hycomLayer});
          this.initializeTimeSlider({view, hycomLayer});
          this.initializeDepthSlider({view, hycomLayer, currentsLayer});
          this.initializeLocationDetails({view, hycomLayer, currentsLayer});
          this.initializeLineDetails({view, hycomLayer, currentsLayer});

          resolve();
        }).catch(reject);
      }).catch(reject);
    });
  }

  /**
   *
   * effect: "bloom(2, 0.5px, 0.0)",
   *
   * @param view
   */
  initializeHYCOMLayers({view}) {
    return new Promise((resolve, reject) => {
      require(["esri/core/promiseUtils"], (promiseUtils) => {

        //const hycomGroupLayer = view.map.layers.find(l => l.title === 'HYCOM');
        const currentsLayer = view.map.allLayers.find(l => l.title === "Ocean Currents");
        const hycomLayer = view.map.allLayers.find(l => l.title === "Sea Water Temperature Celsius");
        Promise.all([currentsLayer.load(), hycomLayer.load()]).then(() => {

          currentsLayer.set({
            renderer: {
              type: "flow",
              flowRepresentation: "flow-from",
              smooth: 10,
              density: 2,
              flowSpeed: 25,
              maxPathLength: 250,
              trailLength: 100,
              trailWidth: 1.2
            }
          });

          const timeDimensionName = 'StdTime';
          const depthDimensionName = 'StdZ';

          const defaultVariable = hycomLayer.multidimensionalInfo.variables[0];
          const timeDimension = defaultVariable.dimensions.find(d => d.name === timeDimensionName);
          const depthDimension = defaultVariable.dimensions.find(d => d.name === depthDimensionName);

          this.getTimeInfo = () => {
            return {
              fullTimeExtent: {
                start: new Date(timeDimension.extent[0]),
                end: new Date(timeDimension.extent[1])
              },
              dates: timeDimension.values.map(value => new Date(value))
            };
          };

          this.getDepthInfo = () => {
            return {
              minDepth: depthDimension.extent[0],
              maxDepth: depthDimension.extent[1],
              depths: [...depthDimension.values]
            };
          };

          this.setCurrentDepth = promiseUtils.debounce((depth) => {
            return new Promise((resolve, reject) => {
              hycomLayer.mosaicRule.multidimensionalDefinition.find(dd => dd.dimensionName === depthDimensionName).values = [depth];
              hycomLayer.refresh();
              currentsLayer.mosaicRule.multidimensionalDefinition.find(dd => dd.dimensionName === depthDimensionName).values = [depth];
              currentsLayer.refresh();

              this._evented.emit('depth-change', {depth});

              resolve();
            });
          });

          this.setCurrentTime = promiseUtils.debounce((time) => {
            return new Promise((resolve, reject) => {
              hycomLayer.mosaicRule.multidimensionalDefinition.find(dd => dd.dimensionName === timeDimensionName).values = [time];
              hycomLayer.refresh();
              currentsLayer.mosaicRule.multidimensionalDefinition.find(dd => dd.dimensionName === timeDimensionName).values = [time];
              currentsLayer.refresh();
              resolve();
            });
          });

          resolve({currentsLayer, hycomLayer});
        });
      });
    });
  }

  /**
   *
   * @param view
   * @param hycomLayer
   */
  initializeVariables({view, hycomLayer}) {
    //console.info(hycomLayer);

    const validRFNames = [
      'Sea Water Temperature Celsius', // Water Temperature (Celsius)
      'Sea Water Temperature Fahrenheit', // Water Temperature (Celsius)
      'Sea Water Salinity' // Sea Water Salinity (PSS)
      // 'Sea Surface Elevation Feet', // Sea Surface Elevation (m)
      // 'Sea Surface Elevation Meters'  // Sea Surface Elevation (m)
    ];

    this.rfNameToVarialbeName = {
      'Sea Water Temperature Celsius': 'Water Temperature (Celsius)',
      'Sea Water Temperature Fahrenheit': 'Water Temperature (Celsius)',
      'Sea Water Salinity': 'Sea Water Salinity (PSS)',
      'Sea Surface Elevation Feet': 'Sea Surface Elevation (m)',
      'Sea Surface Elevation Meters': 'Sea Surface Elevation (m)'
    };

    let _currentRasterFunctionName = validRFNames[0];
    this.getCurrentRasterFunctionName = () => {
      return _currentRasterFunctionName;
    };

    const updateHYCOMLayerRasterFunction = (rasterFunctionName) => {
      _currentRasterFunctionName = rasterFunctionName;
      hycomLayer.set({
        title: _currentRasterFunctionName,
        renderingRule: {functionName: _currentRasterFunctionName}
      });
      this._evented.emit('raster-function-change', {rasterFunctionName: _currentRasterFunctionName});
    };
    updateHYCOMLayerRasterFunction(_currentRasterFunctionName);

    // RASTER FUNCTIONS //
    const rfOptions = hycomLayer.rasterFunctionInfos.reduce((rfOptionsList, rfInfo, rfInfoIdx) => {
      if (validRFNames.includes(rfInfo.name)) {
        console.info(rfInfo);

        const rfOption = document.createElement('calcite-radio-group-item');
        rfOption.setAttribute('value', rfInfo.name);
        rfOption.setAttribute('title', rfInfo.description);
        rfOption.style.setProperty('order', validRFNames.indexOf(rfInfo.name));
        rfOption.toggleAttribute('checked', rfInfoIdx === 0);

        rfOptionsList.push(rfOption);
      }
      return rfOptionsList;
    }, []);

    // RASTER FUNCTION LIST //
    const rfList = document.getElementById('rf-list');
    rfList.replaceChildren(...rfOptions);
    rfList.addEventListener('calciteRadioGroupChange', (changeEvt) => {
      updateHYCOMLayerRasterFunction(changeEvt.detail);
    });

  }

  /**
   *
   * @param view
   * @param hycomLayer
   */
  initializeTimeSlider({view, hycomLayer}) {
    require(["esri/widgets/TimeSlider"], (TimeSlider) => {

      // TIME INFO //
      const {fullTimeExtent, dates} = this.getTimeInfo();
      // MOST RECENT INTERVAL //
      const now = Date.now();
      const mostRecentInterval = dates[dates.findIndex(date => date.valueOf() > now) - 1];

      // TIME SLIDER //
      const timeSlider = new TimeSlider({
        container: "time-slider-container",
        view: view,
        mode: "instant",
        timeVisible: true,
        fullTimeExtent,
        timeExtent: {start: mostRecentInterval, end: mostRecentInterval},
        stops: {dates}
      });

      // LIST OF MONDAYS //
      const listOfMondays = timeSlider.effectiveStops.reduce((list, stop) => {
        // IS MONDAY? //
        if (stop.getDay() === 1) {
          // WHICH MONDAY? //
          const stopKey = `${ stop.getMonth() }.${ stop.getDate() }`;
          // ALREADY HAVE THIS MONDAY? //
          if (!list.has(stopKey)) { list.set(stopKey, stop); }
        }
        return list;
      }, new Map());

      // DAY FORMATTER //
      const dayFormatter = new Intl.DateTimeFormat('default', {month: 'short', day: 'numeric'});

      // TICK AT EVERY MONDAY //
      timeSlider.tickConfigs = [
        {
          mode: 'position',
          values: Array.from(listOfMondays.values()),
          labelsVisible: true,
          labelFormatFunction: (value) => {
            return dayFormatter.format(new Date(value));
          }
        }
      ];

      // INTERVAL LABEL //
      const {interval} = hycomLayer.timeInfo;
      const timePanel = document.getElementById('time-panel');
      timePanel.setAttribute('item-subtitle', `${ interval.value } ${ interval.unit } interval`);

      this.getCurrentTime = () => {
        return timeSlider.timeExtent.start;
      };

    });
  }

  /**
   *
   * @param view
   * @param hycomLayer
   * @param currentsLayer
   */
  initializeDepthSlider({view, hycomLayer, currentsLayer}) {
    require([
      "esri/core/promiseUtils",
      "esri/widgets/Slider"
    ], (promiseUtils, Slider) => {

      const {minDepth, maxDepth, depths} = this.getDepthInfo();

      this.setCurrentDepth(maxDepth);

      const depthSlider = new Slider({
        container: "depth-slider-container",
        min: minDepth,
        max: maxDepth,
        steps: depths,
        values: [maxDepth],
        labelFormatFunction: (value, type) => {
          return (type === 'max') ? 'surface' : value;
        },
        tickConfigs: [
          {
            mode: "position",
            values: depths,
            labelsVisible: true,
            labelFormatFunction: (value, type) => {
              return (value > minDepth) && (value < maxDepth) && (value % -1000 === 0) ? value : " ";
            }
          }
        ],
        visibleElements: {
          labels: true,
          rangeLabels: true
        }
      });
      depthSlider.on(["thumb-drag", "thumb-change"], () => {
        this.setCurrentDepth(depthSlider.values[0]).catch(error => {
          if (error.name !== 'AbortError') {console.error(error);}
        });
      });

      this.getCurrentDepth = () => { return depthSlider.values[0]; };
      this.getAllDepths = () => { return depths; };

    });
  }

  /**
   *
   * @param view
   * @param hycomLayer
   * @param currentsLayer
   */
  initializeLocationDetails({view, hycomLayer, currentsLayer}) {
    require([
      "esri/Graphic",
      "esri/layers/GraphicsLayer"
    ], (Graphic, GraphicsLayer) => {

      const timeDimensionName = 'StdTime';
      const depthDimensionName = 'StdZ';

      const getDetailsAtLocation = location => {
        if (location) {

          const pixelSize = {x: view.resolution, y: view.resolution, spatialReference: view.spatialReference};

          const currentTime = this.getCurrentTime();
          const currentDepth = this.getCurrentDepth();
          const allDepths = this.getAllDepths();

          view.container.style.cursor = 'wait';
          this.updateDepthValues({});

          hycomLayer.identify({
            geometry: location,
            pixelSize: pixelSize,
            renderingRule: hycomLayer.renderingRule,
            mosaicRule: {
              multidimensionalDefinition: [
                {dimensionName: timeDimensionName, values: [currentTime.valueOf()], isSlice: true},
                {dimensionName: depthDimensionName, values: allDepths, isSlice: true}
              ]
            }
          }).then((imageIdentifyResult) => {
            const depthInfos = imageIdentifyResult.properties.Values.map((value, valueIdx) => {
              return {value, depth: allDepths[valueIdx]};
            });

            view.container.style.cursor = 'crosshair';
            this.updateDepthValues({depthInfos, currentDepthIdx: allDepths.indexOf(currentDepth)});
          });
        } else {
          this.updateDepthValues({});
        }
      };

      const locationGraphic = new Graphic({
        symbol: {
          type: 'simple-marker',
          style: 'circle',
          color: '#59d6ff',
          size: 15,
          outline: {
            color: '#efefef',
            width: 1.8
          }
        }
      });
      const locationLayer = new GraphicsLayer({graphics: [locationGraphic]});
      view.map.add(locationLayer);

      const setLocationBtn = document.getElementById('set-location-btn');
      setLocationBtn.addEventListener('click', () => {
        if (setLocationBtn.toggleAttribute('active')) {
          setLocationBtn.setAttribute('appearance', 'solid');
          setLocationBtn.setAttribute('icon-start', 'check');
          enableViewClick();
        } else {
          setLocationBtn.setAttribute('appearance', 'outline');
          setLocationBtn.setAttribute('icon-start', 'blank');
          disableViewClick();
        }
      });

      let _mapPoint = null;
      let viewClickHandle = null;
      const enableViewClick = () => {
        this._evented.emit('view-tool-selected', {tool: 'depth-tool'});
        view.container.style.cursor = 'crosshair';
        viewClickHandle && viewClickHandle.remove();
        viewClickHandle = view.on('click', (clickEvt) => {
          clickEvt.stopPropagation();
          locationGraphic.geometry = _mapPoint = clickEvt.mapPoint;
          getDetailsAtLocation(_mapPoint);
        });
      };
      const disableViewClick = () => {
        view.container.style.cursor = 'default';
        viewClickHandle && viewClickHandle.remove();
        locationGraphic.geometry = _mapPoint = null;
        getDetailsAtLocation();
      };

      this._evented.on('view-tool-selected', ({tool}) => {
        if (tool !== 'depth-tool') {
          disableViewClick();
        }
      });

      this._evented.on('raster-function-change', ({}) => {
        _mapPoint && getDetailsAtLocation(_mapPoint);
      });

    });
  }

  /**
   *
   * @param view
   * @param hycomLayer
   * @param currentsLayer
   */
  initializeLineDetails({view, hycomLayer, currentsLayer}) {
    require([
      "esri/Graphic",
      "esri/layers/GraphicsLayer",
      "esri/geometry/support/geodesicUtils",
      "esri/geometry/support/webMercatorUtils",
      "esri/widgets/Sketch/SketchViewModel"
    ], (Graphic, GraphicsLayer, geodesicUtils, webMercatorUtils, SketchViewModel) => {

      const timeDimensionName = 'StdTime';
      const depthDimensionName = 'StdZ';

      const getDetailsAlongLine = polyline => {
        if (polyline) {

          const pixelSize = {x: view.resolution, y: view.resolution, spatialReference: view.spatialReference};

          const currentTime = this.getCurrentTime();
          const currentDepth = this.getCurrentDepth();

          view.container.style.cursor = 'wait';
          this.updateProfileValues({});

          const variableName = this.rfNameToVarialbeName[this.getCurrentRasterFunctionName()];

          const startLocationWGS84 = webMercatorUtils.webMercatorToGeographic(polyline.getPoint(0, 0));

          hycomLayer.getSamples({
            geometry: polyline,
            pixelSize: pixelSize,
            outFields: ["*"],
            returnFirstValueOnly: false,
            sampleCount: 100,
            mosaicRule: {
              multidimensionalDefinition: [
                {variableName, dimensionName: timeDimensionName, values: [currentTime.valueOf()], isSlice: true},
                {variableName, dimensionName: depthDimensionName, values: [currentDepth], isSlice: true}
              ]
            }
          }).then((sampleResults) => {
            //console.info(sampleResults);

            const {profileInfos} = sampleResults.samples.reduce((infos, sample, sampleIdx) => {
              // attributes | location | locationId | pixelValue | rasterId | resolution //
              //console.info(sample.attributes);

              if(sampleIdx > 0) {
                const alongLocationWGS84 = webMercatorUtils.webMercatorToGeographic(sample.location);
                infos.distanceAlong += geodesicUtils.geodesicDistance(infos.previousAlongLocation, alongLocationWGS84, 'kilometers').distance;
                infos.previousAlongLocation = alongLocationWGS84.clone();
              }

              infos.profileInfos.push({
                value: sample.pixelValue,
                distance: infos.distanceAlong
              });

              return infos;
            }, {profileInfos: [], previousAlongLocation: startLocationWGS84, distanceAlong: 0});

            view.container.style.cursor = 'crosshair';
            this.updateProfileValues({profileInfos, currentDepth});

          });

        } else {
          this.updateProfileValues({});
        }
      };

      const polylineSymbol = {
        type: 'simple-line',
        style: 'solid',
        color: '#59d6ff',
        width: 3.0
      };

      const lineLayer = new GraphicsLayer({});
      view.map.add(lineLayer);

      const setLineBtn = document.getElementById('set-line-btn');
      setLineBtn.addEventListener('click', () => {
        if (setLineBtn.toggleAttribute('active')) {
          setLineBtn.setAttribute('appearance', 'solid');
          setLineBtn.setAttribute('icon-start', 'check');
          enableViewClick();
        } else {
          setLineBtn.setAttribute('appearance', 'outline');
          setLineBtn.setAttribute('icon-start', 'blank');
          disableViewClick();
        }
      });

      const sketchVM = new SketchViewModel({
        layer: lineLayer,
        view: view,
        polylineSymbol
      });
      sketchVM.on("create", (event) => {
        if (event.state === "complete") {
          getDetailsAlongLine(event.graphic.geometry);
        }
      });

      //let viewClickHandle = null;
      const enableViewClick = () => {
        this._evented.emit('view-tool-selected', {tool: 'profile-tool'});
        view.container.style.cursor = 'crosshair';
        lineLayer.removeAll();
        sketchVM.create('polyline');
        /*viewClickHandle && viewClickHandle.remove();
         viewClickHandle = view.on('click', (clickEvt) => {
         clickEvt.stopPropagation();
         locationGraphic.geometry = _polyline = clickEvt.mapPoint;
         getDetailsAlongLine(_polyline);
         });*/

      };
      const disableViewClick = () => {
        view.container.style.cursor = 'default';
        lineLayer.removeAll();
        //viewClickHandle && viewClickHandle.remove();
        getDetailsAlongLine();
      };

      this._evented.on('view-tool-selected', ({tool}) => {
        if (tool !== 'profile-tool') {
          disableViewClick();
        }
      });

      this._evented.on('raster-function-change', ({}) => {
        lineLayer.graphics.length && getDetailsAlongLine(lineLayer.graphics[0].geometry);
      });

    });
  }

  /**
   *
   */
  initializeDataCharts() {

    Chart.defaults.font.family = 'Avenir Next LT Pro';

    const defaultOptions = {
      animations: false,
      responsive: true,
      maintainAspectRatio: false
    };

    const defaultTitle = {
      display: false,
      color: '#efefef',
      font: {weight: 'normal', size: 15}
    };

    const defaultLegend = {
      display: false,
      onClick: null,
      labels: {
        pointStyle: 'line',
        usePointStyle: true,
        color: '#efefef',
        filter: (item, data) => {
          return data.datasets.length;
        }
      }
    };

    const defaultGridLines = {
      color: '#666666',
      drawBorder: true
    };

    const defaultDataset = {
      fill: false,
      borderWidth: 1.5,
      borderColor: '#59d6ff',
      pointBorderColor: '#efefef',
      pointBackgroundColor: '#59d6ff'
    };

    //
    // VALUES AT DEPTHS CHART
    //
    const depthChartNode = document.getElementById('depth-chart');
    const depthChart = new Chart(depthChartNode, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Data',
          data: [],
          ...defaultDataset
        }]
      },
      options: {
        ...defaultOptions,
        plugins: {
          title: {
            ...defaultTitle,
            text: 'Values At Depths'
          },
          legend: defaultLegend,
          annotation: {
            annotations: {
              currentDepth: {
                type: 'line',
                scaleID: 'y',
                drawTime: 'beforeDatasetsDraw',
                borderColor: '#ffffff',
                borderDash: [5, 5],
                borderDashOffset: 1.0,
                borderWidth: 2.0,
                label: {
                  enabled: true,
                  position: 'center',
                  padding: {top: 4, bottom: 2, left: 4, right: 4},
                  backgroundColor: '#424242',
                  content: 'surface'
                },
                value: 0
              }
            }
          }
        },
        indexAxis: 'y',
        scales: {
          x: {
            display: true,
            type: 'linear',
            title: {
              display: true,
              text: 'Data Value',
              color: '#efefef',
              font: {size: 12}
            },
            ticks: {
              color: '#efefef',
              font: {size: 11},
              callback: function (value) {
                return `${ value.toFixed(0) }`; // degrees or pss ???
              }
            },
            grid: defaultGridLines
          },
          y: {
            display: true,
            type: "linear",
            min: -5000,
            max: 0,
            title: {
              display: true,
              text: 'depth in meters',
              color: '#efefef',
              font: {size: 11}
            },
            ticks: {
              padding: 5,
              precision: 0,
              stepSize: 500,
              color: '#efefef',
              callback: function (value, index, values) {
                if (value === 0) {
                  return 'surface';
                } else {
                  if (value > -1000) {
                    return `${ value.toFixed(0) } m`;
                  } else {
                    return `${ (value / 1000).toFixed(1) } km`;
                  }
                }
              }
            },
            grid: defaultGridLines
          }
        }
      }
    });

    const depthMetersFormatter = new Intl.NumberFormat('default', {minimumFractionDigits: 0, maximumFractionDigits: 0});

    this._evented.on('depth-change', ({depth}) => {
      if (depthChart) {
        depthChart.options.plugins.annotation.annotations.currentDepth.value = depth;
        depthChart.options.plugins.annotation.annotations.currentDepth.label.content = (depth < 0) ? `${ depthMetersFormatter.format(depth) } m` : 'surface';
        depthChart.update();
      }
    });

    const distanceKilometersFormatter = new Intl.NumberFormat('default', {minimumFractionDigits: 0, maximumFractionDigits: 0});

    //
    // VALUES ALONG LINE CHART
    //
    const profileChartNode = document.getElementById('profile-chart');
    const profileChart = new Chart(profileChartNode, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Data',
          data: [],
          ...defaultDataset
        }]
      },
      options: {
        ...defaultOptions,
        plugins: {
          title: {
            ...defaultTitle,
            text: 'Data Along Line'
          },
          legend: defaultLegend
        },
        scales: {
          x: {
            display: true,
            type: 'linear',
            position: 'bottom',
            title: {
              display: true,
              text: 'Distance Along (Kms)',
              color: '#efefef',
              font: {size: 12}
            },
            ticks: {
              padding: 10,
              stepSize: 500,
              color: '#efefef',
              font: {size: 11},
              callback: function (value) {
                if (value > 0.0) {
                  return `${ distanceKilometersFormatter.format(value) }`;
                }
              }
            },
            grid: defaultGridLines
          },
          y: {
            display: true,
            type: "linear",
            title: {
              display: true,
              text: 'Data Value',
              color: '#efefef',
              font: {size: 11}
            },
            ticks: {
              padding: 5,
              precision: 0,
              color: '#efefef'
              /*callback: function (value, index, values) {
               return `${ value.toFixed(1) }°`;
               }*/
            },
            grid: defaultGridLines
          }
        }
      }
    });

    this._evented.on('raster-function-change', ({rasterFunctionName}) => {

      //const variableName = this.rfNameToVarialbeName[rasterFunctionName];

      const nameParts = rasterFunctionName.split(' ');
      const longName = nameParts.slice(0, -1).join(' ');
      const shortName = nameParts.slice(-2).join(' ');

      depthChart.data.datasets[0].data = [];
      depthChart.data.datasets[0].label = shortName;
      depthChart.options.scales.x.title.text = shortName;
      depthChart.options.plugins.title.text = longName;
      depthChart.update();

      profileChart.data.datasets[0].data = [];
      profileChart.data.datasets[0].label = shortName;
      profileChart.options.scales.y.title.text = shortName;
      profileChart.options.plugins.title.text = longName;
      profileChart.update();

    });

    this.updateDepthValues = ({depthInfos = null, currentDepthIdx = null}) => {
      depthChart.data.datasets[0].data = depthInfos ? depthInfos.map(({depth, value}) => { return {x: value, y: depth}; }) : [];
      depthChart.update();
    };

    this.updateProfileValues = ({profileInfos = null, currentDepth = null}) => {
      profileChart.data.datasets[0].data = profileInfos ? profileInfos.map(({distance, value}) => { return {x: distance, y: value}; }) : [];
      profileChart.update();
    };
  }

}

export default new Application();


