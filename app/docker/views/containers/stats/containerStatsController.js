import angular from 'angular';
import moment from 'moment';

angular.module('portainer.docker')
.controller('ContainerStatsController', ['$q', '$scope', '$transition$', '$document', '$interval', 'ContainerService', 'ChartService', 'Notifications', 'HttpRequestHelper',
function ($q, $scope, $transition$, $document, $interval, ContainerService, ChartService, Notifications, HttpRequestHelper) {

  $scope.state = {
    refreshRate: '5',
    networkStatsUnavailable: false
  };

  $scope.$on('$destroy', function() {
    stopRepeater();
  });

  function stopRepeater() {
    var repeater = $scope.repeater;
    if (angular.isDefined(repeater)) {
      $interval.cancel(repeater);
      repeater = null;
    }
  }

  function updateNetworkChart(stats, chart) {
    if (stats.Networks.length > 0) {
      var rx = stats.Networks[0].rx_bytes;
      var tx = stats.Networks[0].tx_bytes;
      var label = moment(stats.Date).format('HH:mm:ss');

      ChartService.UpdateNetworkChart(label, rx, tx, chart);
    }
  }

  function updateMemoryChart(stats, chart) {
    var label = moment(stats.Date).format('HH:mm:ss');
    var value = stats.MemoryUsage;

    ChartService.UpdateMemoryChart(label, value, chart);
  }

  function updateCPUChart(stats, chart) {
    var label = moment(stats.Date).format('HH:mm:ss');
    var value = calculateCPUPercentUnix(stats);

    ChartService.UpdateCPUChart(label, value, chart);
  }

  function calculateCPUPercentUnix(stats) {
    var cpuPercent = 0.0;
    var cpuDelta = stats.CurrentCPUTotalUsage - stats.PreviousCPUTotalUsage;
    var systemDelta = stats.CurrentCPUSystemUsage - stats.PreviousCPUSystemUsage;

    if (systemDelta > 0.0 && cpuDelta > 0.0) {
      cpuPercent = (cpuDelta / systemDelta) * stats.CPUCores * 100.0;
    }

    return cpuPercent;
  }

  $scope.changeUpdateRepeater = function() {
    var networkChart = $scope.networkChart;
    var cpuChart = $scope.cpuChart;
    var memoryChart = $scope.memoryChart;

    stopRepeater();
    setUpdateRepeater(networkChart, cpuChart, memoryChart);
    $('#refreshRateChange').show();
    $('#refreshRateChange').fadeOut(1500);
  };

  function startChartUpdate(networkChart, cpuChart, memoryChart) {
    $q.all({
      stats: ContainerService.containerStats($transition$.params().id),
      top: ContainerService.containerTop($transition$.params().id)
    })
    .then(function success(data) {
      var stats = data.stats;
      $scope.processInfo = data.top;
      if (stats.Networks.length === 0) {
        $scope.state.networkStatsUnavailable = true;
      }
      updateNetworkChart(stats, networkChart);
      updateMemoryChart(stats, memoryChart);
      updateCPUChart(stats, cpuChart);
      setUpdateRepeater(networkChart, cpuChart, memoryChart);
    })
    .catch(function error(err) {
      stopRepeater();
      Notifications.error('Failure', err, 'Unable to retrieve container statistics');
    });
  }

  function setUpdateRepeater(networkChart, cpuChart, memoryChart) {
    var refreshRate = $scope.state.refreshRate;
    $scope.repeater = $interval(function() {
      $q.all({
        stats: ContainerService.containerStats($transition$.params().id),
        top: ContainerService.containerTop($transition$.params().id)
      })
      .then(function success(data) {
        var stats = data.stats;
        $scope.processInfo = data.top;
        updateNetworkChart(stats, networkChart);
        updateMemoryChart(stats, memoryChart);
        updateCPUChart(stats, cpuChart);
      })
      .catch(function error(err) {
        stopRepeater();
        Notifications.error('Failure', err, 'Unable to retrieve container statistics');
      });
    }, refreshRate * 1000);
  }

  function initCharts() {
    var networkChartCtx = $('#networkChart');
    var networkChart = ChartService.CreateNetworkChart(networkChartCtx);
    $scope.networkChart = networkChart;

    var cpuChartCtx = $('#cpuChart');
    var cpuChart = ChartService.CreateCPUChart(cpuChartCtx);
    $scope.cpuChart = cpuChart;

    var memoryChartCtx = $('#memoryChart');
    var memoryChart = ChartService.CreateMemoryChart(memoryChartCtx);
    $scope.memoryChart = memoryChart;

    startChartUpdate(networkChart, cpuChart, memoryChart);
  }

  function initView() {
    HttpRequestHelper.setPortainerAgentTargetHeader($transition$.params().nodeName);
    ContainerService.container($transition$.params().id)
    .then(function success(data) {
      $scope.container = data;
    })
    .catch(function error(err) {
      Notifications.error('Failure', err, 'Unable to retrieve container information');
    });

    $document.ready(function() {
      initCharts();
    });
  }

  initView();
}]);
