/**
 * TripSplit — Report Controller
 * Visualizes spending analytics, category breakdowns, and renders interactive Chart.js reports
 */

app.controller('ReportController', ['$scope', '$rootScope', '$timeout', 'apiService', function($scope, $rootScope, $timeout, apiService) {
    $scope.loadingReports = false;
    $scope.categoryBreakdown = [];
    $scope.totalTripSpending = 0;
    $scope.topCategory = null;

    let chartInstance = null;

    // Helper: get current trip ID reliably across nested scopes or URL
    $scope.getTripId = function() {
        if ($scope.currentTripId) return $scope.currentTripId;
        if ($scope.$parent && $scope.$parent.currentTripId) return $scope.$parent.currentTripId;
        if ($scope.$parent && $scope.$parent.selectedTrip) return $scope.$parent.selectedTrip;
        if ($rootScope.currentTripId) return $rootScope.currentTripId;
        const params = new URLSearchParams(window.location.search);
        const paramId = params.get('id') || params.get('trip_id');
        return paramId ? parseInt(paramId, 10) : null;
    };

    // Load category reports
    $scope.loadReports = function() {
        const tripId = $scope.getTripId();
        if (!tripId) return;
        $scope.loadingReports = true;

        apiService.getBalances(tripId).then(function(res) {
            const data = res.data.data;
            $scope.categoryBreakdown = data.category_breakdown || [];
            $scope.totalTripSpending = data.trip ? data.trip.total_expenses_rupees : 0;

            if ($scope.categoryBreakdown.length > 0) {
                $scope.topCategory = $scope.categoryBreakdown[0];
            } else {
                $scope.topCategory = null;
            }

            $scope.loadingReports = false;

            // Render chart after DOM digest
            $timeout(function() {
                $scope.renderCategoryChart();
            }, 100);
        }).catch(function(err) {
            $scope.loadingReports = false;
            $rootScope.showToast('Failed to load reports', 'danger');
        });
    };

    // Render Chart.js Chart
    $scope.renderCategoryChart = function() {
        const canvas = document.getElementById('categoryChartCanvas');
        if (!canvas) return;

        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded');
            return;
        }

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        if ($scope.categoryBreakdown.length === 0) {
            return;
        }

        const labels = $scope.categoryBreakdown.map(c => c.category);
        const dataValues = $scope.categoryBreakdown.map(c => c.total_rupees);

        const categoryColors = {
            'Food': '#f59e0b',
            'Hotel': '#4f46e5',
            'Transport': '#3b82f6',
            'Shopping': '#ec4899',
            'Activities': '#10b981',
            'Other': '#64748b'
        };

        const bgColors = labels.map(l => categoryColors[l] || '#94a3b8');

        const ctx = canvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: bgColors,
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: {
                                family: "'Plus Jakarta Sans', sans-serif",
                                size: 12
                            },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return ' ' + label + ': ₹' + Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                            }
                        }
                    }
                },
                cutout: '68%'
            }
        });
    };

    // Events
    $scope.$on('refreshReports', function() {
        $scope.loadReports();
    });

    // Cleanup on destroy
    $scope.$on('$destroy', function() {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
    });

    // Initial load
    $scope.loadReports();
}]);
