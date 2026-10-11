/**
 * TripSplit — Settlement Controller
 * Manages balances calculation, automated debt-simplification settlement suggestions,
 * full & partial repayment recording, settlement history, and safe repayment reversal.
 */

app.controller('SettlementController', ['$scope', '$rootScope', 'apiService', function($scope, $rootScope, apiService) {
    $scope.loadingBalances = false;
    $scope.memberBalances = [];
    $scope.suggestions = [];
    $scope.settlementsHistory = [];
    $scope.balanceSumPaise = 0;
    $scope.isFullySettled = false;

    // Payment recording modal model
    $scope.paymentForm = {
        sender_member_id: '',
        receiver_member_id: '',
        amount: '',
        payment_date: new Date(),
        notes: ''
    };

    $scope.settlementToReverse = null;

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

    // Load balances and suggestions from API
    $scope.loadBalances = function() {
        const tripId = $scope.getTripId();
        if (!tripId) return;
        $scope.loadingBalances = true;

        apiService.getBalances(tripId).then(function(res) {
            const data = res.data.data;
            $scope.memberBalances = data.member_balances || [];
            $scope.suggestions = data.suggestions || [];
            $scope.balanceSumPaise = data.balance_sum_paise || 0;
            $scope.isFullySettled = data.is_fully_settled || false;
            $scope.loadingBalances = false;
        }).catch(function(err) {
            $scope.loadingBalances = false;
            $rootScope.showToast('Failed to load balance summary', 'danger');
        });

        // Also fetch settlement history
        $scope.loadSettlementHistory();
    };

    // Load recorded settlements history
    $scope.loadSettlementHistory = function() {
        const tripId = $scope.getTripId();
        if (!tripId) return;

        apiService.getSettlements(tripId).then(function(res) {
            $scope.settlementsHistory = res.data.data || [];
        }).catch(function(err) {
            // Silently handle or toast
        });
    };

    // Pre-fill and open "Record Payment" modal from a suggestion
    $scope.openRecordPaymentModal = function(suggestion) {
        $scope.paymentForm = {
            sender_member_id: suggestion ? suggestion.sender_id.toString() : '',
            receiver_member_id: suggestion ? suggestion.receiver_id.toString() : '',
            amount: suggestion ? suggestion.amount_rupees : '',
            payment_date: new Date(),
            notes: suggestion ? ('Settlement: ' + suggestion.sender_name + ' to ' + suggestion.receiver_name) : ''
        };

        const modalEl = document.getElementById('recordPaymentModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // Save payment record
    $scope.recordPayment = function() {
        if (!$scope.paymentForm.sender_member_id || !$scope.paymentForm.receiver_member_id) {
            $rootScope.showToast('Please select both sender and receiver', 'warning');
            return;
        }

        if ($scope.paymentForm.sender_member_id === $scope.paymentForm.receiver_member_id) {
            $rootScope.showToast('Sender and receiver cannot be the same member', 'warning');
            return;
        }

        const amt = parseFloat($scope.paymentForm.amount);
        if (isNaN(amt) || amt <= 0) {
            $rootScope.showToast('Please enter a valid payment amount greater than ₹0', 'warning');
            return;
        }

        let pDateStr = $scope.paymentForm.payment_date;
        if (pDateStr instanceof Date) {
            pDateStr = pDateStr.getFullYear() + '-' + String(pDateStr.getMonth() + 1).padStart(2, '0') + '-' + String(pDateStr.getDate()).padStart(2, '0');
        }

        const payload = {
            trip_id: $scope.getTripId(),
            sender_member_id: parseInt($scope.paymentForm.sender_member_id, 10),
            receiver_member_id: parseInt($scope.paymentForm.receiver_member_id, 10),
            amount_rupees: amt,
            payment_date: pDateStr,
            notes: ($scope.paymentForm.notes || '').trim()
        };

        apiService.recordSettlement(payload).then(function(res) {
            $rootScope.showToast('Repayment of ₹' + amt.toFixed(2) + ' recorded successfully!', 'success');

            const modalEl = document.getElementById('recordPaymentModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            $scope.loadBalances();
            $scope.$emit('tripDataChanged');
        }).catch(function(err) {
            const msg = err.data && err.data.message ? err.data.message : 'Error recording payment';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Prompt reversal/deletion confirmation
    $scope.confirmReverseSettlement = function(settlement) {
        $scope.settlementToReverse = settlement;
        const modalEl = document.getElementById('reversePaymentModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // Execute settlement reversal/deletion
    $scope.executeReverseSettlement = function() {
        if (!$scope.settlementToReverse) return;

        apiService.deleteSettlement($scope.settlementToReverse.id).then(function() {
            $rootScope.showToast('Settlement record reversed/removed.', 'success');

            const modalEl = document.getElementById('reversePaymentModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            $scope.settlementToReverse = null;
            $scope.loadBalances();
            $scope.$emit('tripDataChanged');
        }).catch(function(err) {
            const msg = err.data && err.data.message ? err.data.message : 'Error reversing settlement';
            $rootScope.showToast(msg, 'danger');
        });
    };

    // Events
    $scope.$on('refreshBalances', function() {
        $scope.loadBalances();
    });

    $scope.$on('membersUpdated', function() {
        $scope.loadBalances();
    });

    // Initial load
    $scope.loadBalances();
}]);
